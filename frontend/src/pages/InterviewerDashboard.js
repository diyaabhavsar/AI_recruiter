import { useState, useEffect, useCallback } from "react";
import { createInterview, listInterviews } from "../services/api.js";
import ScoreBar from "../components/ScoreBar.js";

const HIRE_COLORS = { "Strong Hire": "#4ade80", "Hire": "#86efac", "Maybe": "#facc15", "No Hire": "#f87171" };
const STATUS_COLORS = { pending: "#facc15", "in-progress": "#38bdf8", completed: "#4ade80" };

export default function InterviewerDashboard() {
    const [intervieweeName, setIntervieweeName] = useState("");
    const [resume, setResume] = useState("");
    const [jd, setJd] = useState("");
    const [generatedLink, setGeneratedLink] = useState(null);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState(null);
    const [interviews, setInterviews] = useState([]);
    const [expandedId, setExpandedId] = useState(null);
    const [copied, setCopied] = useState(false);

    // ── Fetch interviews list ───────────────────────────────────────────────
    const fetchInterviews = useCallback(async () => {
        try {
            const data = await listInterviews();
            setInterviews(data);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchInterviews();
        const interval = setInterval(fetchInterviews, 8000); // auto-refresh
        return () => clearInterval(interval);
    }, [fetchInterviews]);

    // ── Create interview ────────────────────────────────────────────────────
    const handleSubmit = async () => {
        if (!intervieweeName.trim() || !resume.trim() || !jd.trim()) return;
        setCreating(true);
        setError(null);
        try {
            const { sessionId } = await createInterview(intervieweeName, resume, jd);
            const link = `${window.location.origin}${window.location.pathname}?session=${sessionId}`;
            setGeneratedLink(link);
            fetchInterviews();
        } catch (err) {
            setError(err.message);
        } finally {
            setCreating(false);
        }
    };

    const copyLink = () => {
        if (generatedLink) {
            navigator.clipboard.writeText(generatedLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const resetForm = () => {
        setIntervieweeName("");
        setResume("");
        setJd("");
        setGeneratedLink(null);
        setError(null);
    };

    // ── Styles ──────────────────────────────────────────────────────────────
    const S = {
        root: { minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', sans-serif", color: "#1e293b" },
        header: {
            borderBottom: "1px solid #e2e8f0", padding: "16px 28px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "rgba(255, 255, 255, 0.95)", backdropFilter: "blur(12px)",
            position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
        },
        logo: { fontSize: 18, fontWeight: 800, color: "#4f46e5", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 10, fontFamily: "'Outfit', sans-serif" },
        badge: (c) => ({ fontSize: 10, padding: "4px 10px", borderRadius: 6, background: c + "1A", color: c, border: `1px solid ${c}33`, letterSpacing: "0.08em", fontWeight: 700, textTransform: "uppercase" }),
        card: { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.03)" },
        textarea: { width: "100%", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 8, color: "#334155", padding: "12px 14px", fontFamily: "inherit", fontSize: 14, resize: "vertical", minHeight: 110, lineHeight: 1.65 },
        input: { width: "100%", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 8, color: "#334155", padding: "12px 14px", fontFamily: "inherit", fontSize: 14, minHeight: 44 },
        btn: (primary, disabled) => ({
            padding: "12px 24px", borderRadius: 8, border: primary ? "none" : "1px solid #e2e8f0",
            cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 13,
            letterSpacing: "0.05em", transition: "all 0.2s",
            background: primary ? (disabled ? "#cbd5e1" : "linear-gradient(135deg, #6366f1, #8b5cf6)") : "#ffffff",
            color: disabled ? "#94a3b8" : primary ? "#ffffff" : "#4f46e5",
            opacity: disabled ? 0.7 : 1,
            boxShadow: primary && !disabled ? "0 4px 10px rgba(99, 102, 241, 0.3)" : "none",
        }),
        label: { fontSize: 11, letterSpacing: "0.08em", color: "#64748b", textTransform: "uppercase", marginBottom: 8, display: "block", fontWeight: 600 },
    };

    return (
        <div style={S.root}>
            <div style={S.header}>
                <div style={S.logo}>
                    <span>◈</span> INTERVIEW.AI
                    <span style={S.badge("#4f46e5")}>INTERVIEWER PORTAL</span>
                </div>
            </div>

            <div style={{ maxWidth: 920, margin: "0 auto", padding: "40px 20px", animation: "fadeUp .5s ease" }}>
                {/* Title */}
                <div style={{ textAlign: "center", marginBottom: 44 }}>
                    <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 40, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.02em", color: "#0f172a" }}>
                        Create <span style={{ color: "#6366f1" }}>Interview</span>
                    </h1>
                    <p style={{ color: "#64748b", marginTop: 12, fontSize: 15, lineHeight: 1.7 }}>
                        Fill in the details below and share the generated link with your candidate
                    </p>
                </div>

                {/* ── Link generated success ──────────────────────────────── */}
                {generatedLink ? (
                    <div style={{ ...S.card, marginBottom: 32, border: "1px solid #86efac", background: "#f0fdf4", textAlign: "center", padding: "32px 24px", boxShadow: "0 10px 15px -3px rgba(34,197,94,0.1)" }}>
                        <div style={{ fontSize: 42, marginBottom: 12 }}>✅</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#166534", letterSpacing: "0.05em", marginBottom: 16, fontFamily: "'Outfit', sans-serif" }}>
                            INTERVIEW LINK READY
                        </div>
                        <div style={{
                            background: "#ffffff", border: "1px solid #bbf7d0", borderRadius: 8,
                            padding: "16px", fontSize: 14, color: "#6366f1", wordBreak: "break-all",
                            marginBottom: 20, lineHeight: 1.6, fontWeight: 500
                        }}>
                            {generatedLink}
                        </div>
                        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                            <button style={S.btn(true)} onClick={copyLink}>
                                {copied ? "✓ COPIED!" : "📋 COPY LINK"}
                            </button>
                            <button style={S.btn(false)} onClick={resetForm}>
                                + CREATE ANOTHER
                            </button>
                        </div>
                        <p style={{ color: "#166534", fontSize: 12, marginTop: 14, opacity: 0.8 }}>
                            Share this link with the candidate. When they open it, the interview will start immediately.
                        </p>
                    </div>
                ) : (
                    /* ── Create form ──────────────────────────────────────── */
                    <>
                        {/* Interviewee Name */}
                        <div style={{ ...S.card, marginBottom: 16 }}>
                            <label style={S.label}>👤 Interviewee Name</label>
                            <input
                                style={S.input}
                                placeholder="Interviewee name (e.g. Diya Bhavsar)"
                                value={intervieweeName}
                                onChange={e => setIntervieweeName(e.target.value)}
                            />
                        </div>

                        {/* Resume + JD */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                            <div style={S.card}>
                                <label style={S.label}>📄 Candidate Resume / CV</label>
                                <textarea style={S.textarea} placeholder="Paste candidate resume here..." value={resume} onChange={e => setResume(e.target.value)} rows={7} />
                            </div>
                            <div style={S.card}>
                                <label style={S.label}>💼 Job Description</label>
                                <textarea style={S.textarea} placeholder="Paste job description here..." value={jd} onChange={e => setJd(e.target.value)} rows={7} />
                            </div>
                        </div>

                        {error && (
                            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#dc2626", fontWeight: 500 }}>
                                ⚠ {error}
                            </div>
                        )}

                        <div style={{ textAlign: "center", marginTop: 10 }}>
                            <button
                                style={{ ...S.btn(true, !intervieweeName.trim() || !resume.trim() || !jd.trim() || creating), padding: "14px 32px", fontSize: 14 }}
                                onClick={handleSubmit}
                                disabled={!intervieweeName.trim() || !resume.trim() || !jd.trim() || creating}
                            >
                                {creating ? "⏳ CREATING..." : "🔗 GENERATE INTERVIEW LINK"}
                            </button>
                        </div>
                    </>
                )}

                {/* ══════════════════════════════════════════════════════════ */}
                {/*  INTERVIEW RESULTS TABLE                                  */}
                {/* ══════════════════════════════════════════════════════════ */}
                {interviews.length > 0 && (
                    <div style={{ marginTop: 60 }}>
                        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 700, marginBottom: 24, color: "#1e293b", display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#6366f1" }}>📊</span> Interview Results
                        </h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            {interviews.map(iv => {
                                const statusColor = STATUS_COLORS[iv.status] || "#94a3b8";
                                const isExpanded = expandedId === iv.sessionId;
                                const ev = iv.evaluation;
                                const hireColor = ev ? (HIRE_COLORS[ev.hiringSuggestion] || "#6366f1") : "#94a3b8";

                                return (
                                    <div key={iv.sessionId} style={{
                                        ...S.card,
                                        padding: 0,
                                        overflow: "hidden",
                                        cursor: "pointer",
                                        border: isExpanded ? "1px solid #8b5cf6" : "1px solid #e2e8f0",
                                        boxShadow: isExpanded ? "0 10px 15px -3px rgba(99,102,241,0.1)" : "0 2px 4px rgba(0,0,0,0.02)",
                                        transition: "all 0.2s",
                                    }} onClick={() => setExpandedId(isExpanded ? null : iv.sessionId)}>
                                        {/* Row header */}
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", background: isExpanded ? "#fafaff" : "#fff" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                                <div style={{
                                                    width: 44, height: 44, borderRadius: "50%",
                                                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    fontSize: 18, fontWeight: 700, color: "#fff",
                                                    boxShadow: "0 2px 4px rgba(99,102,241,0.3)"
                                                }}>
                                                    {iv.interviewerName.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>
                                                        {iv.interviewerName}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                                                        {new Date(iv.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                                                {ev && (
                                                    <span style={{ fontSize: 24, fontWeight: 800, color: hireColor, fontFamily: "'Outfit', sans-serif" }}>
                                                        {ev.overallScore}
                                                    </span>
                                                )}
                                                <span style={S.badge(statusColor)}>
                                                    {iv.status.toUpperCase()}
                                                </span>
                                                <div style={{
                                                    width: 28, height: 28, borderRadius: "50%", background: "#f1f5f9",
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    color: "#64748b", transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "none"
                                                }}>
                                                    ▼
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expanded details */}
                                        {isExpanded && ev && (
                                            <div style={{ padding: "0 24px 24px", borderTop: "1px solid #e2e8f0", background: "#fff", animation: "fadeUp .3s ease" }}>
                                                <div style={{ height: 24 }}></div>
                                                {/* Score + Hiring Suggestion */}
                                                <div style={{ display: "flex", gap: 24, alignItems: "center", marginBottom: 24 }}>
                                                    <div style={{ textAlign: "center", background: "#f8fafc", padding: "16px 24px", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                                                        <div style={{ fontSize: 56, fontWeight: 800, color: hireColor, fontFamily: "'Outfit', sans-serif", lineHeight: 1 }}>{ev.overallScore}</div>
                                                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, fontWeight: 500 }}>/ 100</div>
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ marginBottom: 12 }}>
                                                            <span style={{ ...S.badge(hireColor), fontSize: 12, padding: "6px 16px" }}>{ev.hiringSuggestion}</span>
                                                        </div>
                                                        <ScoreBar score={ev.overallScore} color={hireColor} />
                                                        <p style={{ fontSize: 13, color: "#334155", marginTop: 12, lineHeight: 1.6 }}>{ev.summary}</p>
                                                    </div>
                                                </div>

                                                {/* Strengths + Weaknesses */}
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
                                                    <div style={{ background: "#f0fdf4", padding: 16, borderRadius: 12, border: "1px solid #bbf7d0" }}>
                                                        <label style={{ ...S.label, color: "#166534" }}>✓ STRENGTHS</label>
                                                        {(ev.strengths || []).map((s, i) => (
                                                            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                                                                <span style={{ color: "#22c55e", fontSize: 14, fontWeight: "bold" }}>+</span>
                                                                <span style={{ fontSize: 13, color: "#166534", lineHeight: 1.5 }}>{typeof s === "string" ? s : JSON.stringify(s)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div style={{ background: "#fef2f2", padding: 16, borderRadius: 12, border: "1px solid #fecaca" }}>
                                                        <label style={{ ...S.label, color: "#991b1b" }}>✗ WEAKNESSES</label>
                                                        {(ev.weaknesses || []).map((w, i) => (
                                                            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                                                                <span style={{ color: "#ef4444", fontSize: 14, fontWeight: "bold" }}>−</span>
                                                                <span style={{ fontSize: 13, color: "#991b1b", lineHeight: 1.5 }}>{typeof w === "string" ? w : (w.improvement || w.tips || JSON.stringify(w))}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Topic Scores */}
                                                {(ev.topicScores || []).length > 0 && (
                                                    <div style={{ marginBottom: 24, padding: 16, background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                                                        <label style={S.label}>📊 TOPIC SCORES</label>
                                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                                                            {ev.topicScores.map((t, i) => (
                                                                <div key={i}>
                                                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6, fontWeight: 500 }}>
                                                                        <span style={{ color: "#334155" }}>{t.topic}</span>
                                                                        <span style={{ color: "#6366f1", fontWeight: 700 }}>{t.score}</span>
                                                                    </div>
                                                                    <ScoreBar score={t.score} color="#6366f1" />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Recommendation */}
                                                <div style={{ background: `${hireColor}1A`, border: `1px solid ${hireColor}33`, borderRadius: 12, padding: "16px 20px", textAlign: "center" }}>
                                                    <label style={{ ...S.label, color: hireColor }}>RECOMMENDATION</label>
                                                    <p style={{ fontSize: 14, lineHeight: 1.6, color: "#1e293b", fontWeight: 500 }}>{typeof ev.recommendation === "string" ? ev.recommendation : JSON.stringify(ev.recommendation)}</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Status message for non-completed */}
                                        {isExpanded && !ev && (
                                            <div style={{ padding: "0 24px 24px", background: "#fff" }}>
                                                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 24, textAlign: "center" }}>
                                                    <p style={{ fontSize: 14, color: "#64748b", fontWeight: 500 }}>
                                                        {iv.status === "pending" ? "⏳ Waiting for candidate to start the interview..." : "🎙 Interview is currently in progress..."}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
