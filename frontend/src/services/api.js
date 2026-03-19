import { API_BASE } from "../constants/index.js";

// ── Evaluation ──────────────────────────────────────────────────────────────
export async function generateEvaluation(transcript, answerScores, resume, jobDescription, groqKey, candidateAnswers, expectedQuestions) {
    const transcriptText = (transcript || [])
        .map(u => `${u.role === "agent" ? "Interviewer" : "Candidate"}: ${u.content}`)
        .join("\n");

    const answerScoresText = JSON.stringify(answerScores?.map(s => ({ score: s.score, quality: s.quality })));

    const res = await fetch(`${API_BASE}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            transcriptText,
            answerScoresText,
            resume,
            jobDescription,
            groqKey,
            candidateAnswers,
            expectedQuestions
        }),
    });

    if (!res.ok) {
        throw new Error(await res.text() || "Evaluation failed");
    }
    return await res.json();
}

// ── Create web call (Retell) ────────────────────────────────────────────────
export async function createWebCall(resume, jobDescription, agentId, retellKey, groqKey, sessionId) {
    const res = await fetch(`${API_BASE}/create-web-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, jobDescription, agentId, retellKey, groqKey, sessionId }),
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
}

// ── Fetch call result ───────────────────────────────────────────────────────
export async function fetchCallResult(callId) {
    const r = await fetch(`${API_BASE}/call-result/${callId}`);
    if (!r.ok) throw new Error("Failed to fetch result");
    return await r.json();
}

// ══════════════════════════════════════════════════════════════════════════════
//  Interview Session APIs (new)
// ══════════════════════════════════════════════════════════════════════════════

// ── Create interview session (Interviewer) ──────────────────────────────────
export async function createInterview(interviewerName, resume, jobDescription) {
    const res = await fetch(`${API_BASE}/create-interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewerName, resume, jobDescription }),
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
}

// ── Get interview session (Candidate) ───────────────────────────────────────
export async function getInterviewSession(sessionId) {
    const res = await fetch(`${API_BASE}/interview/${sessionId}`);
    if (!res.ok) throw new Error("Interview session not found");
    return await res.json();
}

// ── List all interview sessions (Interviewer dashboard) ─────────────────────
export async function listInterviews() {
    const res = await fetch(`${API_BASE}/interviews`);
    if (!res.ok) throw new Error("Failed to fetch interviews");
    return await res.json();
}

// ── Save evaluation result back to session ──────────────────────────────────
export async function saveInterviewResult(sessionId, evaluation, candidateAnswers, transcript) {
    const res = await fetch(`${API_BASE}/interview/${sessionId}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluation, candidateAnswers, transcript }),
    });
    if (!res.ok) throw new Error("Failed to save result");
    return await res.json();
}
