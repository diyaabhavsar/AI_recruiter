// ── In-memory stores ────────────────────────────────────────────────────────

// Active call sessions (keyed by Retell call_id)
const callSessions = new Map();

// Interview sessions created by interviewers (keyed by sessionId)
const interviewSessions = new Map();

export default callSessions;
export { interviewSessions };
