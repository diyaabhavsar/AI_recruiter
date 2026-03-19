import { WebSocketServer, WebSocket } from "ws";
import { anthropic, groq } from "../services/clients.js";
import callSessions, {
    interviewSessions,
    saveToDisk,
    resetSessionFlowState,
    archiveInterview,
} from "../store.js";
import {
    buildSystemPrompt,
    enforceSingleQuestion,
    mergeTranscript,
    upsertTranscriptUtterance,
    extractPlainText,
    scoreAnswer,
    isValidAnswer,
} from "../utils.js";

// ── Scripted lines (all spoken by Retell / Alex's voice) ─────────────────────
const GREETING  = "Hello, this is Alex calling from Mobio Solutions. I will be conducting your technical interview today. How are you doing?";
const INTRO_ASK = "Great. Please go ahead and introduce yourself — tell me about your educational background, your experience, and what you have been working on recently.";
const INTRO_REASK = "I did not quite catch that. Could you please introduce yourself — tell me about your background and what you have been working on?";

// ── Sync session state ────────────────────────────────────────────────────────
function syncSessionState(session, interviewSession, fullTranscript) {
    session.transcript = fullTranscript;
    if (interviewSession) {
        interviewSession.transcript = fullTranscript;
        interviewSession.candidateAnswers = session.answerScores?.length ?? 0;
    }
}

// ── Send one complete response packet ─────────────────────────────────────────
function sendFixed(ws, responseId, content, isEnd = false) {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
        response_type: "response",
        response_id: responseId,
        content,
        content_complete: true,
        end_call: isEnd,
    }));
}

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
        let interviewSession = null;
        let fullTranscript = [];
        let lastScoredAnswer = "";

        const parts = ws.pathname?.split("/").filter(Boolean) || [];
        const urlCallId = parts.length > 1 ? parts[1] : null;
        if (urlCallId) session = callSessions.get(urlCallId);

        ws.on("message", async (raw) => {
            let msg;
            try { msg = JSON.parse(raw.toString()); }
            catch { return; }

            // ── ping_pong ─────────────────────────────────────────────────
            if (msg.interaction_type === "ping_pong") {
                ws.send(JSON.stringify({
                    response_type: "ping_pong",
                    timestamp: msg.timestamp,
                }));
                return;
            }

            // ── call_details ──────────────────────────────────────────────
            if (msg.interaction_type === "call_details") {
                const callId = msg.call?.call_id;
                const meta = msg.call?.metadata ?? {};

                if (!session) session = callSessions.get(callId);

                if (!session) {
                    session = {
                        callId,
                        resume: meta.resume ?? "",
                        jobDescription: meta.jobDescription ?? "",
                        difficulty: 2,
                        flags: [],
                        // flowStage:
                        //   0 = waiting for candidate's intro (TTS greeting already played by frontend)
                        //   1 = intro received, generating Q&A
                        flowStage: 0,
                        questionsAsked: 0,
                        maxQuestions: 14,
                        answerScores: [],
                        lastQuestion: "",
                        candidateIntro: "",
                        introReAsked: false,
                        interviewEnded: false,
                        pendingResponse: false,
                        lastResponseAt: 0,
                        latestResponseId: 0,
                        transcript: [],
                    };
                    callSessions.set(callId, session);
                    console.log(`📋 New session: ${callId}`);
                } else {
                    archiveInterview(session, interviewSession);
                    resetSessionFlowState(session);
                    session.lastQuestion = "";
                    if (meta.resume) session.resume = meta.resume;
                    if (meta.jobDescription) session.jobDescription = meta.jobDescription;
                    console.log(`📋 Session reset: ${callId}`);
                }

                if (meta.sessionId) {
                    interviewSession = interviewSessions.get(meta.sessionId);
                    if (interviewSession) {
                        interviewSession.callId = callId;
                        interviewSession.callSession = session;
                        interviewSession.status = "in-progress";
                        interviewSession.startedAt = interviewSession.startedAt
                            ?? new Date().toISOString();
                    }
                }

                // Fresh transcript for every new call
                fullTranscript = [];
                session.transcript = [];

                console.log(`📋 Session ready: ${session.callId} | flowStage: 0`);

                ws.send(JSON.stringify({
                    response_type: "config",
                    config: {
                        auto_reconnect: true,
                        call_details: true,
                        transcript_with_tool_calls: false,
                    },
                }));

                syncSessionState(session, interviewSession, fullTranscript);
                saveToDisk();
                return;
            }

            // ── update_only ───────────────────────────────────────────────
            if (msg.interaction_type === "update_only") {
                mergeTranscript(fullTranscript, msg.transcript ?? []);
                if (session) {
                    syncSessionState(session, interviewSession, fullTranscript);
                    saveToDisk();
                }
                return;
            }

            // Ignore all other types
            if (
                msg.interaction_type !== "response_required" &&
                msg.interaction_type !== "reminder_required"
            ) return;

            if (!session) return;

            const responseId = msg.response_id;
            const now = Date.now();
            const isReminder = msg.interaction_type === "reminder_required";

            // ── Gate 1: interview ended ───────────────────────────────────
            if (session.interviewEnded) {
                console.log("⏭ Interview ended — forcing end_call");
                sendFixed(ws, responseId, "", true);
                return;
            }

            // ── Gate 2: stale response_id ─────────────────────────────────
            if (responseId < session.latestResponseId) {
                console.log(`⏭ Stale response_id ${responseId} (latest: ${session.latestResponseId})`);
                return;
            }
            session.latestResponseId = responseId;

            // ── Gate 3: debounce ──────────────────────────────────────────
            if (session.pendingResponse && now - session.lastResponseAt < 1500) {
                console.log(`⏭ Debounced — response_id ${responseId}`);
                return;
            }

            // ── Gate 4: stuck pendingResponse ────────────────────────────
            if (session.pendingResponse && now - session.lastResponseAt > 30000) {
                console.warn("⚠️ pendingResponse stuck for 30s — resetting");
                session.pendingResponse = false;
            }

            if (session.pendingResponse) return;

            // ── Gate 5: Alex speaks first ─────────────────────────────────
            // If the candidate hasn't spoken yet, always respond with GREETING.
            // This fires on Retell's initial response_required AND any reminders,
            // guaranteeing Alex speaks first regardless of begin_message timing.
            const candidateHasSpoken = fullTranscript.some(u => u.role === "user");
            if (session.flowStage === 0 && !candidateHasSpoken) {
                upsertTranscriptUtterance(fullTranscript, { role: "agent", content: GREETING });
                syncSessionState(session, interviewSession, fullTranscript);
                sendFixed(ws, responseId, GREETING);
                console.log("👋 Greeting sent — Alex speaks first");
                return;
            }

            session.pendingResponse = true;
            session.lastResponseAt = now;

            // Merge transcript
            mergeTranscript(fullTranscript, msg.transcript ?? []);
            syncSessionState(session, interviewSession, fullTranscript);

            // Score only real answers to real questions (stage 2+, after Q1 is asked)
            const lastCandidate = [...fullTranscript].reverse().find(u => u.role === "user");
            if (
                session.flowStage >= 2 && session.questionsAsked >= 1 &&
                lastCandidate?.content &&
                session.lastQuestion &&
                lastCandidate.content !== lastScoredAnswer &&
                isValidAnswer(lastCandidate.content)
            ) {
                lastScoredAnswer = lastCandidate.content;
                console.log(`📝 Scoring: "${lastCandidate.content.slice(0, 80)}"`);
                scoreAnswer(session, session.lastQuestion, lastCandidate.content);
            }

            try {

                // ════════════════════════════════════════════════════════
                // STAGE 0: Candidate responded to greeting → ask for intro
                // ════════════════════════════════════════════════════════
                if (session.flowStage === 0) {
                    session.flowStage = 1;
                    session.lastQuestion = INTRO_ASK;
                    session.lastResponseAt = Date.now();
                    upsertTranscriptUtterance(fullTranscript, { role: "agent", content: INTRO_ASK });
                    syncSessionState(session, interviewSession, fullTranscript);
                    saveToDisk();
                    sendFixed(ws, responseId, INTRO_ASK);
                    console.log("📝 Stage 0→1: Intro ask sent");
                    session.pendingResponse = false;
                    return;
                }

                // ════════════════════════════════════════════════════════
                // STAGE 1: Candidate should introduce themselves
                // Validate — re-ask ONCE if too short / invalid
                // ════════════════════════════════════════════════════════
                if (session.flowStage === 1) {
                    const answer = lastCandidate?.content ?? "";
                    const introValid = isValidAnswer(answer) && answer.split(/\s+/).length >= 8;

                    if (!introValid && !session.introReAsked) {
                        session.introReAsked = true;
                        session.lastQuestion = INTRO_REASK;
                        session.lastResponseAt = Date.now();
                        upsertTranscriptUtterance(fullTranscript, { role: "agent", content: INTRO_REASK });
                        syncSessionState(session, interviewSession, fullTranscript);
                        saveToDisk();
                        sendFixed(ws, responseId, INTRO_REASK);
                        console.log("🔁 Stage 1: Re-asking intro once");
                        session.pendingResponse = false;
                        return;
                    }

                    if (introValid) {
                        session.candidateIntro = answer;
                        console.log(`✅ Intro saved: "${answer.slice(0, 80)}"`);
                    } else {
                        console.log("⏭ Already re-asked — moving to Q1 regardless");
                    }

                    session.flowStage = 2;
                    console.log("✅ Stage 1→2: Generating Q1");
                    // Fall through to LLM
                }

                // ════════════════════════════════════════════════════════
                // STAGE 2+: Real interview questions via LLM
                // Every question is grounded in:
                //   • Candidate intro   • Resume   • JD   • Prior answers
                // questionsAsked ONLY increments here
                // ════════════════════════════════════════════════════════

                // Reminder — repeat last question, never increment count
                if (isReminder && session.lastQuestion) {
                    const reminder = `Take your time. ${session.lastQuestion}`;
                    session.lastResponseAt = Date.now();
                    sendFixed(ws, responseId, reminder);
                    console.log(`🔔 Reminder sent for Q${session.questionsAsked}`);
                    session.pendingResponse = false;
                    return;
                }

                // Guard: wrap up ONLY after all 14 questions are answered
                console.log(`📊 questionsAsked=${session.questionsAsked} maxQuestions=${session.maxQuestions} flowStage=${session.flowStage}`);
                if (session.questionsAsked >= session.maxQuestions) {
                    const wrapUpMsg = "That wraps it up. The team will follow up with you. Have a good day.";
                    
                    session.interviewEnded = true;
                    upsertTranscriptUtterance(fullTranscript, { role: "agent", content: wrapUpMsg });
                    syncSessionState(session, interviewSession, fullTranscript);
                    
                    archiveInterview(session, interviewSession);
                    saveToDisk();

                    if (interviewSession && interviewSession.status !== "completed") {
                        interviewSession.status = "completed";
                        interviewSession.completedAt = new Date().toISOString();
                        saveToDisk();
                        console.log(`✅ Interview completed + archived (${interviewSession?.sessionId})`);
                    }

                    // Send the message and gracefully terminate the connection
                    sendFixed(ws, responseId, wrapUpMsg, true);
                    console.log(`✅ Interview wrapped up cleanly after ${session.questionsAsked} questions.`);
                    session.pendingResponse = false;
                    return;
                }

                // Generate via LLM + stream to Retell
                const response = await generateWithStreaming(
                    session, fullTranscript, ws, responseId
                );

                session.lastQuestion = response;
                session.questionsAsked++;
                session.lastResponseAt = Date.now();

                upsertTranscriptUtterance(fullTranscript, { role: "agent", content: response });
                syncSessionState(session, interviewSession, fullTranscript);
                saveToDisk();

                // Completion marker — content already streamed in chunks
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        response_type: "response",
                        response_id: responseId,
                        content: "",
                        content_complete: true,
                        end_call: false,
                    }));
                }

                console.log(`✅ Q${session.questionsAsked}/${session.maxQuestions} | stage:${session.flowStage}`);
                console.log(`   → "${response.slice(0, 100)}"`);

            } catch (err) {
                console.error("❌ LLM failed:", err.message);

                const fallback = session.lastQuestion
                    ? `Let me rephrase. ${session.lastQuestion}`
                    : "Can you tell me about your most recent project?";

                sendFixed(ws, responseId, fallback);
                upsertTranscriptUtterance(fullTranscript, { role: "agent", content: fallback });
                syncSessionState(session, interviewSession, fullTranscript);
                saveToDisk();

            } finally {
                session.pendingResponse = false;
            }
        });

        ws.on("close", () => {
            console.log(`🔌 Retell disconnected | questionsAsked=${session?.questionsAsked ?? 0} | flowStage=${session?.flowStage ?? 0}`);
            // Only mark complete on unexpected disconnect if interview was meaningfully in progress
            if (
                interviewSession &&
                interviewSession.status === "in-progress" &&
                session?.questionsAsked >= 1
            ) {
                interviewSession.status = "completed";
                interviewSession.completedAt = new Date().toISOString();
                archiveInterview(session, interviewSession);
                saveToDisk();
            }
        });

        ws.on("error", (e) => console.error("WS error:", e.message));
    });
}

// ── Stream LLM response to Retell ────────────────────────────────────────────
async function generateWithStreaming(session, fullTranscript, ws, responseId) {
    const systemPrompt = buildSystemPrompt(session, fullTranscript);

    // Build history — merge consecutive same-role turns
    const rawHistory = fullTranscript.slice(-16);
    const history = [];

    for (const utterance of rawHistory) {
        const role = utterance.role === "agent" ? "assistant" : "user";
        if (history.length > 0 && history[history.length - 1].role === role) {
            history[history.length - 1].content += `\n\n${utterance.content}`;
        } else {
            history.push({ role, content: utterance.content });
        }
    }

    // Must start with user
    if (history.length === 0 || history[0].role === "assistant") {
        history.unshift({ role: "user", content: "(Interview started)" });
    }

    // Must end with user
    if (history[history.length - 1].role === "assistant") {
        history.push({ role: "user", content: "[Generate the next interview question]" });
    }

    // Inject garbage signal if last answer was filler
    const lastCandidate = [...fullTranscript].reverse().find(u => u.role === "user");
    if (lastCandidate && !isValidAnswer(lastCandidate.content)) {
        const lastUserIdx = history.map(h => h.role).lastIndexOf("user");
        if (lastUserIdx !== -1) {
            history[lastUserIdx].content =
                "[Candidate gave no real answer — filler or noise. " +
                "Do NOT acknowledge it. Ask the next question from the flow " +
                "grounded in their intro, resume, or JD.]";
        }
    }

    // ── Primary: Claude Haiku with streaming ─────────────────────────────
    try {
        console.log(`🤖 Claude Haiku (Q${session.questionsAsked + 1})...`);

        let fullText = "";
        let buffer = "";

        const stream = anthropic.messages.stream({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 180,
            temperature: 0.15,
            system: systemPrompt,
            messages: history,
        });

        for await (const event of stream) {
            if (!ws || ws.readyState !== WebSocket.OPEN) break;

            if (
                event.type === "content_block_delta" &&
                event.delta?.type === "text_delta" &&
                event.delta.text
            ) {
                const chunk = event.delta.text;
                fullText += chunk;
                buffer += chunk;

                // Stream at sentence boundaries — Retell starts TTS immediately
                if (/[.!?]/.test(chunk) && buffer.trim().length >= 15) {
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
        }

        await stream.finalMessage();

        // Flush remaining buffer
        if (buffer.trim() && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                response_type: "response",
                response_id: responseId,
                content: buffer,
                content_complete: false,
                end_call: false,
            }));
        }

        if (!fullText.trim()) throw new Error("Claude returned empty");

        console.log(`✅ Claude: "${fullText.slice(0, 100)}"`);
        return enforceSingleQuestion(extractPlainText(fullText));

    } catch (claudeErr) {
        console.warn(`⚠️ Claude failed: ${claudeErr.message} — trying Groq`);
    }

    // ── Fallback: Groq ────────────────────────────────────────────────────
    try {
        console.log("🤖 Groq fallback...");

        const groqResp = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            max_tokens: 180,
            temperature: 0.15,
            stream: false,
            messages: [
                { role: "system", content: systemPrompt },
                ...history,
            ],
        });

        const fullText = groqResp.choices[0]?.message?.content ?? "";
        if (!fullText.trim()) throw new Error("Groq returned empty");

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                response_type: "response",
                response_id: responseId,
                content: fullText,
                content_complete: false,
                end_call: false,
            }));
        }

        console.log(`✅ Groq: "${fullText.slice(0, 100)}"`);
        return enforceSingleQuestion(extractPlainText(fullText));

    } catch (groqErr) {
        console.error(`❌ Groq also failed: ${groqErr.message}`);
        throw new Error("Both Claude and Groq failed");
    }
}
