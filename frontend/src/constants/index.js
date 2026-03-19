export const API_BASE = (process.env.REACT_APP_API_URL || "http://localhost:3001").replace(/\/+$/, "");
export const FRONTEND_BASE = (process.env.REACT_APP_FRONTEND_URL || window.location.origin).replace(/\/+$/, "");
export const AGENT_ID = process.env.REACT_APP_AGENT_ID || "";

export const STAGE = {
    SETUP: "setup",
    INTERVIEW: "interview",
    EVALUATING: "evaluating",
    RESULT: "result",
    THANKYOU: "thankyou",
};
