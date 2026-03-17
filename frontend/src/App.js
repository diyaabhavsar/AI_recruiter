import InterviewerDashboard from "./pages/InterviewerDashboard.js";
import CandidateInterview from "./pages/CandidateInterview.js";
import "./App.css";

/**
 * Simple URL-based router:
 *   - /?session=XXXX → Candidate interview page
 *   - /              → Interviewer dashboard
 */
export default function App() {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session");

    if (sessionId) {
        return <CandidateInterview sessionId={sessionId} />;
    }

    return <InterviewerDashboard />;
}
