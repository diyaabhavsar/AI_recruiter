import { WebSocketServer, WebSocket } from "ws";
import { groq } from "../services/clients.js";
import callSessions from "../store.js";
import { buildSystemPrompt, enforceSingleQuestion } from "../utils.js";
import Groq from "groq-sdk";

export function setupLlmWebSocket(httpServer) {
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on("upgrade", (request, socket, head) => {
        const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
        if (pathname.startsWith("/llm-websocket")) {
            wss.handleUpgrade(request, socket, head, (ws) => {
                ws.pathname = pathname;
                wss.emit("connection", ws, request);
            });
        } else {
            socket.destroy();
        }
    });

    wss.on("connection", (ws) => {
        console.log("🔌 Retell connected");

        let session = null;
        let fullTranscript = [];

        // Pre-link session if call_id is in the URL path
        const parts = ws.pathname?.split("/").filter(Boolean) || [];
        const urlCallId = parts.length > 1 ? parts[1] : null;
        if (urlCallId) session = callSessions.get(urlCallId);

        ws.on("message", async (raw) => {
            let msg;
            try { msg = JSON.parse(raw.toString()); }
            catch { return; }

            // ── call_details ──────────────────────────────────────────────
            if (msg.interaction_type === "call_details") {
                const callId = msg.call?.call_id;
                const meta = msg.call?.metadata ?? {};

                if (!session) session = callSessions.get(callId);

                if (!session) {
                    session = {
                        callId: callId,
                        resume: meta.resume ?? "",
                        jobDescription: meta.jobDescription ?? "",
                        questionsAsked: 0,
                        maxQuestions: 11,
                        difficulty: 2,
                        answerScores: [],
                        flags: [],
                        lastQuestion: "",
                        pendingResponse: false,
                        lastResponseAt: 0,
                        greetingDone: false, // tracks if candidate responded to greeting
                    };
                    callSessions.set(callId, session);
                }

                fullTranscript = [];
                console.log(`📋 Session started: ${session.callId}`);

                // begin_message fires INSTANTLY when call connects
                // Alex speaks first — candidate hasn't said anything yet
                ws.send(JSON.stringify({
                    response_type: "config",
                    config: {
                        auto_reconnect: true,
                        call_details: true,
                        transcript_with_tool_calls: false,
                        begin_message: "Hi, I'm Alex calling from Mobio Solutions. I'll be conducting your interview today. Hope you're doing well. Whenever you're ready, go ahead.",
                    },
                }));
                return;
            }

            // ── ping_pong ─────────────────────────────────────────────────
            if (msg.interaction_type === "ping_pong") {
                ws.send(JSON.stringify({
                    response_type: "ping_pong",
                    timestamp: msg.timestamp,
                }));
                return;
            }

            // ── update_only — keep our full transcript up to date ─────────
            // Retell only sends last 2 utterances per event
            // we maintain the full history ourselves
            if (msg.interaction_type === "update_only") {
                mergeTranscript(fullTranscript, msg.transcript ?? []);
                return;
            }

            // ── response_required / reminder_required ─────────────────────
            if (
                msg.interaction_type === "response_required" ||
                msg.interaction_type === "reminder_required"
            ) {
                if (!session) return;

                const responseId = msg.response_id;
                const now = Date.now();

                // Debounce — skip if already generating and it was recent
                if (session.pendingResponse && now - session.lastResponseAt < 1500) {
                    console.log(`⏭ Debounced — response_id ${responseId}`);
                    return;
                }

                session.pendingResponse = true;
                mergeTranscript(fullTranscript, msg.transcript ?? []);

                // Score previous candidate answer in background (non-blocking)
                const lastCandidate = [...fullTranscript].reverse().find(u => u.role === "user");
                if (lastCandidate?.content && session.lastQuestion) {
                    scoreAnswer(session, session.lastQuestion, lastCandidate.content);
                }

                try {
                    let response = "";

                    // ── Turn 1: candidate responded to the greeting ───────
                    // They said "hi", "hello", "I'm good" etc.
                    // Fixed line — no LLM needed here
                    if (!session.greetingDone) {
                        session.greetingDone = true;
                        response = "Great. Please go ahead and introduce yourself — tell me about your background and what you've been working on recently.";
                    }

                    // ── Turn 2+: LLM generates questions ─────────────────
                    // LLM now has the candidate's intro in history
                    // and generates role-appropriate questions
                    else {
                        const history = fullTranscript.slice(-14).map(u => ({
                            role: u.role === "agent" ? "assistant" : "user",
                            content: u.content,
                        }));

                        const stream = await groq.chat.completions.create({
                            model: "llama-3.3-70b-versatile",
                            max_tokens: 80,
                            temperature: 0.3,
                            stream: true,
                            messages: [
                                { role: "system", content: buildSystemPrompt(session) },
                                ...history,
                            ],
                        });

                        let fullText = "";
                        let buffer = "";

                        for await (const chunk of stream) {
                            if (ws.readyState !== WebSocket.OPEN) break;

                            const delta = chunk.choices[0]?.delta?.content ?? "";
                            if (!delta) continue;

                            fullText += delta;
                            buffer += delta;

                            // Flush at sentence boundaries for low-latency TTS
                            if (/[.!?]/.test(delta) && buffer.trim().length > 8) {
                                ws.send(JSON.stringify({
                                    response_type: "response",
                                    response_id: responseId,
                                    content: buffer,
                                    content_complete: false,
                                    end_call: false,
                                }));
                                buffer = "";
                            }
                        }

                        // Flush any remaining buffer
                        if (buffer.trim() && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                response_type: "response",
                                response_id: responseId,
                                content: buffer,
                                content_complete: false,
                                end_call: false,
                            }));
                        }

                        // Strip JSON wrapper + enforce single question
                        response = extractPlainText(fullText);
                        response = enforceSingleQuestion(response);
                    }

                    session.lastQuestion = response;
                    session.questionsAsked++;
                    session.lastResponseAt = Date.now();

                    // Add Alex's response to our full transcript
                    fullTranscript.push({ role: "agent", content: response });

                    const isEnd =
                        session.questionsAsked >= session.maxQuestions ||
                        response.toLowerCase().includes("team will follow up");

                    // Send final completion marker
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            response_type: "response",
                            response_id: responseId,
                            content: session.greetingDone && session.questionsAsked === 1
                                ? response  // first real response — send as content too
                                : "",       // streaming already sent the content
                            content_complete: true,
                            end_call: isEnd,
                        }));
                    }

                    console.log(`✅ Q${session.questionsAsked} | greetingDone:${session.greetingDone} | response_id:${responseId}`);
                    console.log(`   → "${response}"`);

                } catch (err) {
                    console.error("Groq error:", err.message);
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            response_type: "response",
                            response_id: responseId,
                            content: "Give me a moment.",
                            content_complete: true,
                            end_call: false,
                        }));
                    }
                } finally {
                    session.pendingResponse = false;
                }
            }
        });

        ws.on("close", () => console.log("🔌 Retell disconnected"));
        ws.on("error", (e) => console.error("WS error:", e.message));
    });

    // ── Strip JSON wrapper if Groq returns {"question": "..."} ───────────
    function extractPlainText(raw) {
        if (!raw?.trim()) return "";
        let text = raw.trim();

        try {
            const stripped = text.replace(/^```json|```$/g, "").trim();
            const parsed = JSON.parse(stripped);
            const val = parsed.question || parsed.response || parsed.content
                || parsed.text || parsed.message || Object.values(parsed)[0];
            if (typeof val === "string") text = val.trim();
        } catch { /* not JSON — good */ }

        text = text
            .replace(/^\{.*?"[^"]*":\s*"/s, "")
            .replace(/"\s*\}$/s, "")
            .replace(/^["']|["']$/g, "")
            .trim();

        return text;
    }

    // ── Merge Retell's trimmed transcript into our full one ───────────────
    function mergeTranscript(full, incoming) {
        for (const utterance of incoming) {
            if (!utterance.content?.trim()) continue;
            const exists = full.some(
                u => u.role === utterance.role &&
                    u.content.trim() === utterance.content.trim()
            );
            if (!exists) {
                full.push({ role: utterance.role, content: utterance.content.trim() });
            }
        }
    }

    // ── Score answer async (non-blocking) ────────────────────────────────
    async function scoreAnswer(session, question, answer) {
        try {
            const groqClient = session.groqKey
                ? new Groq({ apiKey: session.groqKey })
                : groq;

            const res = await groqClient.chat.completions.create({
                model: "llama-3.1-8b-instant",
                max_tokens: 250,
                temperature: 0.2,
                response_format: { type: "json_object" },
                messages: [{
                    role: "user",
                    content: `Evaluate this interview answer strictly. Respond ONLY with JSON.
QUESTION: ${question}
CANDIDATE ANSWER: ${answer}
{
  "score": <0-10>,
  "quality": "<poor|fair|good|excellent>",
  "reasoning": "<one sentence why>",
  "idealModel": "<what a great answer would include>",
  "coaching": "<one actionable tip for the candidate>"
}`,
                }],
            });

            const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}");
            session.answerScores.push({ ...parsed, question, answer });

            // Adjust difficulty based on score
            if (parsed.score >= 8) session.difficulty = Math.min(3, session.difficulty + 1);
            else if (parsed.score <= 3) session.difficulty = Math.max(1, session.difficulty - 1);

            console.log(`📊 Score: ${parsed.score}/10 (${parsed.quality}) | difficulty → ${session.difficulty}`);
        } catch (e) {
            console.warn("Scoring failed (non-fatal):", e.message);
        }
    }
}