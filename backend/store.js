import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "db.json");

// ── Load existing data from disk ──────────────────────────────────────────────
function loadData() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const raw = fs.readFileSync(DB_PATH, "utf8");
            const data = JSON.parse(raw);
            return {
                callSessions:      new Map(Object.entries(data.callSessions || {})),
                interviewSessions: new Map(Object.entries(data.interviewSessions || {})),
                // interviewHistory = all completed interviews, never overwritten
                interviewHistory:  new Map(Object.entries(data.interviewHistory || {})),
            };
        }
    } catch (e) {
        console.warn("Could not load db.json, starting fresh:", e.message);
    }
    return {
        callSessions:      new Map(),
        interviewSessions: new Map(),
        interviewHistory:  new Map(),
    };
}

const {
    callSessions:      initialCall,
    interviewSessions: initialInterview,
    interviewHistory:  initialHistory,
} = loadData();

const callSessions      = initialCall;
const interviewSessions = initialInterview;
const interviewHistory  = initialHistory;

// ── Save everything to disk ───────────────────────────────────────────────────
export function saveToDisk() {
    try {
        const data = {
            callSessions:      Object.fromEntries(callSessions),
            interviewSessions: Object.fromEntries(interviewSessions),
            interviewHistory:  Object.fromEntries(interviewHistory),
        };
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
        console.error("Failed to save to disk:", e.message);
    }
}

// ── Archive a completed interview before resetting ────────────────────────────
// Call this BEFORE resetSessionFlowState so data is never lost
export function archiveInterview(session, interviewSession) {
    if (!session) return;

    // Only archive if there were real questions asked
    if (!session.questionsAsked || session.questionsAsked === 0) return;

    const archiveKey = `${session.callId}_${Date.now()}`;

    const record = {
        // Identity
        archiveKey,
        callId:        session.callId,
        sessionId:     interviewSession?.sessionId ?? null,
        candidateName: interviewSession?.candidateName ?? "Unknown",
        role:          interviewSession?.role ?? "Unknown",

        // Timing
        startedAt: interviewSession?.startedAt ?? new Date().toISOString(),
        completedAt: new Date().toISOString(),

        // Interview data
        resume: session.resume,
        jobDescription: session.jobDescription,
        questionsAsked: session.questionsAsked,
        answerScores: session.answerScores ?? [],
        transcript: session.transcript ?? [],
        candidateIntro: session.candidateIntro ?? "",
        difficulty: session.difficulty,
        flags: session.flags ?? [],

        // Computed result
        overallScore: computeOverallScore(session.answerScores ?? []),
        status: "completed",
    };

    interviewHistory.set(archiveKey, record);
    console.log(`📦 Interview archived: ${archiveKey} | Q:${session.questionsAsked} | score:${record.overallScore}`);
}

// ── Compute overall score from answerScores ───────────────────────────────────
function computeOverallScore(answerScores) {
    if (!answerScores || answerScores.length === 0) return 0;
    const total = answerScores.reduce((sum, a) => sum + (a.score ?? 0), 0);
    return Math.round((total / (answerScores.length * 10)) * 100);
}

// ── Reset flow state for a session (called on every new call) ─────────────────
// Keeps the session entry but wipes all runtime/interview state
export function resetSessionFlowState(session) {
    session.flowStage = 0;
    session.questionsAsked = 0;
    session.answerScores = [];
    session.lastQuestion = "";
    session.candidateIntro = "";
    session.introReAsked = false;
    session.interviewEnded = false;
    session.pendingResponse = false;
    session.lastResponseAt = 0;
    session.latestResponseId = 0;
    session.transcript = [];
    session.flags = [];
    return session;
}

// ── Get all interview history sorted by date ──────────────────────────────────
export function getInterviewHistory() {
    return [...interviewHistory.values()]
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
}

export default callSessions;
export { interviewSessions, interviewHistory };
