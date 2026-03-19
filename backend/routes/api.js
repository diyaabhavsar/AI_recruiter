import express from "express";
import { retell, groq } from "../services/clients.js";
import callSessions, { interviewSessions, saveToDisk } from "../store.js";
import Retell from "retell-sdk";
import Groq from "groq-sdk";
import { getInterviewHistory, interviewHistory } from "../store.js";

const router = express.Router();

// GET /interview-history — returns all completed interviews
router.get("/interview-history", (req, res) => {
    const history = getInterviewHistory();
    res.json({
        total: history.length,
        interviews: history.map(h => ({
            archiveKey: h.archiveKey,
            callId: h.callId,
            candidateName: h.candidateName,
            role: h.role,
            startedAt: h.startedAt,
            completedAt: h.completedAt,
            questionsAsked: h.questionsAsked,
            overallScore: h.overallScore,
            answersCount: h.answerScores?.length ?? 0,
            status: h.status,
        })),
    });
});

// GET /interview-history/:archiveKey — full details including transcript
router.get("/interview-history/:archiveKey", (req, res) => {
    const record = interviewHistory.get(req.params.archiveKey);
    if (!record) return res.status(404).json({ error: "Interview not found" });
    res.json(record);
});




// ── Helper: generate a unique session ID ────────────────────────────────────
function generateSessionId() {
    return Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
}

// ══════════════════════════════════════════════════════════════════════════════
//  INTERVIEW SESSION ENDPOINTS (Interviewer ↔ Candidate)
// ══════════════════════════════════════════════════════════════════════════════

// ── Create interview session (Interviewer fills form → gets link) ───────────
router.post("/create-interview", (req, res) => {
    try {
        const { interviewerName, resume, jobDescription } = req.body;

        if (!interviewerName?.trim() || !resume?.trim() || !jobDescription?.trim()) {
            return res.status(400).json({ error: "interviewerName, resume, and jobDescription are all required" });
        }

        const sessionId = generateSessionId();
        interviewSessions.set(sessionId, {
            sessionId,
            interviewerName: interviewerName.trim(),
            resume: resume.slice(0, 3000),
            jobDescription: jobDescription.slice(0, 2000),
            createdAt: new Date().toISOString(),
            status: "pending",       // pending → in-progress → completed
            callId: null,
            evaluation: null,
            candidateAnswers: 0,
        });

        console.log(`📋 Interview session created: ${sessionId} by ${interviewerName}`);
        saveToDisk(); // Persist newly created session
        res.json({ sessionId });
    } catch (err) {
        console.error("create-interview error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ── Get interview session details (Candidate opens the link) ────────────────
router.get("/interview/:sessionId", (req, res) => {
    const session = interviewSessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Interview session not found" });

    // Only return what the candidate needs (not the evaluation)
    res.json({
        sessionId: session.sessionId,
        interviewerName: session.interviewerName,
        status: session.status,
        // Resume and JD are sent when creating the call, not exposed to the candidate UI
    });
});

// ── List all interview sessions (Interviewer dashboard) ─────────────────────
router.get("/interviews", (req, res) => {
    const interviews = Array.from(interviewSessions.values())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(s => ({
            sessionId: s.sessionId,
            interviewerName: s.interviewerName,
            createdAt: s.createdAt,
            status: s.status,
            candidateAnswers: s.candidateAnswers,
            evaluation: s.evaluation,
            transcript: s.transcript || [],
        }));
    res.json(interviews);
});

// ── Save evaluation result (Candidate's browser sends after interview) ──────
router.post("/interview/:sessionId/result", (req, res) => {
    const session = interviewSessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Not found" });

    session.evaluation = req.body.evaluation;
    session.candidateAnswers = req.body.candidateAnswers ?? 0;
    session.transcript = req.body.transcript ?? [];
    session.status = "completed";

    console.log(`✅ Evaluation saved for session ${session.sessionId} | Score: ${session.evaluation?.overallScore ?? "N/A"} | Transcript: ${session.transcript.length} lines`);
    saveToDisk(); // Persist the final score and transcript
    res.json({ ok: true });
});


// ══════════════════════════════════════════════════════════════════════════════
//  EXISTING ENDPOINTS (Call management)
// ══════════════════════════════════════════════════════════════════════════════

// ── REST: create web call ──────────────────────────────────────────────────────
router.post("/create-web-call", async (req, res) => {
    try {
        let { resume, jobDescription, agentId, retellKey, groqKey, anthropicKey, sessionId } = req.body;

        // If a sessionId is provided, pull resume/JD from the stored interview session
        if (sessionId) {
            const interviewSession = interviewSessions.get(sessionId);
            if (interviewSession) {
                resume = interviewSession.resume;
                jobDescription = interviewSession.jobDescription;
            }
        }

        if (!resume || !jobDescription) {
            return res.status(400).json({ error: "resume and jobDescription required" });
        }

        if (!agentId && !process.env.RETELL_AGENT_ID) {
            return res.status(400).json({ error: "agentId required (or set RETELL_AGENT_ID env var)" });
        }

        const aid = agentId || process.env.RETELL_AGENT_ID;

        const retellClient = retellKey ? new Retell({ apiKey: retellKey }) : retell;

        // Create the web call via Retell SDK
        const webCall = await retellClient.call.createWebCall({
            agent_id: aid,
            // Pass resume & JD as metadata so our WS handler can use them
            metadata: {
                resume: resume.slice(0, 2000), // keep payload reasonable
                jobDescription: jobDescription.slice(0, 1000),
                groqKey: groqKey || "",
                anthropicKey: anthropicKey || "",
                sessionId: sessionId || "",
            },
        });

        // Pre-initialize session to prevent 404s if frontend sends flags early
        callSessions.set(webCall.call_id, {
            callId: webCall.call_id,
            resume: resume.slice(0, 2000),
            jobDescription: jobDescription.slice(0, 1000),
            groqKey: groqKey || "",
            anthropicKey: anthropicKey || "",
            transcript: [],
            difficulty: 2,
            flowStage: 0,
            questionsAsked: 0,
            maxQuestions: 12,
            answerScores: [],
            flags: [],
            lastQuestion: "",
            lastResponseAt: 0,
            pendingResponse: false,
        });

        // Link the call to the interview session if provided
        if (sessionId) {
            const interviewSession = interviewSessions.get(sessionId);
            if (interviewSession) {
                interviewSession.callId = webCall.call_id;
                interviewSession.status = "in-progress";
            }
        }

        res.json({
            access_token: webCall.access_token,
            call_id: webCall.call_id,
        });
    } catch (err) {
        console.error("create-web-call error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ── REST: clear agent begin_message (run once after setup) ─────────────────────
// The Retell agent was created with a begin_message that plays before our
// WebSocket is ready.  This endpoint clears it so our WebSocket controls
// the greeting entirely.
router.post("/clear-agent-greeting", async (req, res) => {
    try {
        const agentId = req.body.agentId || process.env.RETELL_AGENT_ID;
        if (!agentId) return res.status(400).json({ error: "agentId required (or set RETELL_AGENT_ID env var)" });

        await retell.agent.update(agentId, { begin_message: "" });
        console.log(`✅ Agent ${agentId} begin_message cleared`);
        res.json({ ok: true, message: "Agent begin_message cleared — WebSocket now controls the greeting" });
    } catch (err) {
        console.error("clear-agent-greeting error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ── REST: one-time agent setup ──────────────────────────────────────────────────
router.get("/setup-agent", async (req, res) => {
    try {
        const publicUrl = process.env.PUBLIC_URL;
        if (!publicUrl) {
            return res.status(400).json({ error: "Set PUBLIC_URL in .env first" });
        }

        const llmWsUrl = `${publicUrl.replace("https://", "wss://").replace("http://", "ws://")}/llm-websocket`;

        // Create agent using custom LLM — all responses go through our WebSocket → Claude pipeline
        const agent = await retell.agent.create({
            response_engine: {
                type: "custom-llm",
                llm_websocket_url: llmWsUrl,
            },
            voice_id: "11labs-Cimo",
            agent_name: "Alex - AI Interviewer",
            // No begin_message — frontend Web Speech API plays the greeting immediately
            // so Alex speaks the instant the call connects, before the candidate says anything
            ambient_sound: "call-center",
            boosted_keywords: ["experience", "project", "challenges", "architecture", "design"],
            interruption_sensitivity: 0.8,
            language: "en-US",
        });

        console.log("✅ Agent created:", agent.agent_id);
        console.log("   Add to .env:  RETELL_AGENT_ID=" + agent.agent_id);

        res.json({
            message: "Agent created! Save the agent_id in your .env as RETELL_AGENT_ID",
            agent_id: agent.agent_id,
            llm_ws_url: llmWsUrl,
        });
    } catch (err) {
        console.error("setup-agent error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ── REST: get call result (for evaluation) ─────────────────────────────────────
router.get("/call-result/:callId", async (req, res) => {
    try {
        const session = callSessions.get(req.params.callId);
        if (!session) return res.status(404).json({ error: "Session not found" });
        res.json({
            transcript: session.transcript,
            questionsAsked: session.questionsAsked,
            answerScores: session.answerScores,
            finalDifficulty: session.difficulty,
            flags: session.flags,
            tabSwitches: session.tabSwitches ?? 0,
            resume: session.resume,
            jobDescription: session.jobDescription,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── REST: update cheating flags from frontend ──────────────────────────────────
router.post("/flag/:callId", (req, res) => {
    const session = callSessions.get(req.params.callId);
    if (!session) return res.status(404).json({ error: "Not found" });
    session.flags.push({ ...req.body, time: new Date().toISOString() });
    res.json({ ok: true });
});

// ── REST: fetch groq evaluation ──────────────────────────────────────────────
router.post("/evaluate", async (req, res) => {
    try {
        const { transcriptText, answerScoresText, resume, jobDescription, groqKey, candidateAnswers = 0, expectedQuestions = 12 } = req.body;

        const prompt = `You are Alex, a Senior Technical Interviewer. 
        Perform a professional, deep-dive evaluation of this candidate's interview performance using the FOUR-LAYER FEEDBACK MODEL.

        RESUME: ${resume}
        JOB DESCRIPTION: ${jobDescription}

        TRANSCRIPT:
        ${transcriptText}

        INDIVIDUAL RESPONSE DATA (Raw): ${answerScoresText}
        
        TOTAL QUESTIONS ANSWERED BY CANDIDATE: ${candidateAnswers} out of ${expectedQuestions} exactly.

        EVALUATION CRITERIA (Strict Rubric):
        1. LAYER 1: Response Accuracy. Compare each answer to the "Ideal Model" for that specific technical question.
        2. LAYER 2: Strategic Flow. Did the candidate bridge features to business value? Did they handle "Distraction Handling" well?
        3. LAYER 3: Persona-Aware Fit. Score based on the expectations for a candidate facing a Senior Technical Interviewer.
        4. LAYER 4: Reasoning-Based Grading. For every score, explain the logic.

        SCORING RULES:
        - Overall Score is out of 100.
        - COMPLETION PENALTY: The candidate MUST be explicitly penalized if they did not answer all ${expectedQuestions} questions. 
          If they only answered ${candidateAnswers} out of ${expectedQuestions}, their absolute maximum overall score must mathematically scale (e.g., answered 3/12 questions -> Max possible score ~ 25/100). Grade the quality of the answers given, but then cap/reduce the final score based on completion rate!
        - Be STRICT. But a 100/100 is not impossible.
        - 90+ = Exceptional Leader, 80-89 = Strong Hire, 60-79 = Potential Hire, <60 = No Hire.

        Respond ONLY with valid JSON:
        {
          "overallScore": <0-100>,
          "hiringSuggestion": "<Strong Hire | Hire | Maybe | No Hire>",
          "summary": "<2-3 sentence strategic summary of the session 'Arc'>",
          "strengths": ["<Specific strength based on JD>","<Evidence from transcript>","<Growth potential>"],
          "weaknesses": ["<Specific gap vs Ideal Answer>","<Missed opportunity>","<Communication simplicity issue>"],
          "topicScores": [
            {"topic":"Technical Accuracy","score":<0-100>,"note":"Reasoning based on Ideal Answer comparison"},
            {"topic":"Strategic Value (ROI)","score":<0-100>,"note":"Persona-aware scoring (business impact)"},
            {"topic":"Communication Depth","score":<0-100>,"note":"Reasoning based on persona expectations"}
          ],
          "recommendation": "<Concrete 2-sentence hiring recommendation including next technical level>"
        }`;

        const groqClient = groqKey ? new Groq({ apiKey: groqKey }) : groq;

        const resp = await groqClient.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.1,
        });

        const text = resp.choices[0]?.message?.content ?? "";
        res.json(JSON.parse(text));
    } catch (err) {
        console.error("Evaluation error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ── Health check ───────────────────────────────────────────────────────────────
router.get("/health", (_, res) => res.json({ ok: true, ts: Date.now() }));

export default router;
