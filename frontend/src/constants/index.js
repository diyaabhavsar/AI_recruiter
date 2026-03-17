export const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:3001";
export const AGENT_ID = process.env.REACT_APP_AGENT_ID || "";

export const STAGE = {
    SETUP: "setup",
    INTERVIEW: "interview",
    EVALUATING: "evaluating",
    RESULT: "result",
    THANKYOU: "thankyou",
};
