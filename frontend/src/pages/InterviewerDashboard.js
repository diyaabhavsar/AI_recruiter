import { useState, useEffect, useCallback } from "react";
import { createInterview, listInterviews } from "../services/api.js";
import { FRONTEND_BASE } from "../constants/index.js";
import ScoreBar from "../components/ScoreBar.js";
import Sidebar from "../components/Sidebar.js";

const HIRE_COLORS = { "Strong Hire": "#4ade80", "Hire": "#86efac", "Maybe": "#facc15", "No Hire": "#f87171" };
const STATUS_COLORS = { pending: "#facc15", "in-progress": "#38bdf8", completed: "#4ade80" };

export default function InterviewerDashboard() {
    const [activeTab, setActiveTab] = useState("create");
    const [intervieweeName, setIntervieweeName] = useState("");
    const [resume, setResume] = useState("");
    const [jd, setJd] = useState("");
    const [generatedLink, setGeneratedLink] = useState(null);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState(null);
    const [interviews, setInterviews] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
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
            const baseUrl = FRONTEND_BASE.replace(/\/+$/, "");
            const link = `${baseUrl}/?session=${sessionId}`;
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
        root: { minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', sans-serif", color: "#1e293b", display: "flex" },
        main: { flex: 1, marginLeft: 280, padding: 40, height: "100vh", overflowY: "auto" },
        header: { marginBottom: 40 },
        title: { fontFamily: "'Outfit', sans-serif", fontSize: 32, fontWeight: 800, color: "#0f172a", marginBottom: 8 },
        subtitle: { color: "#64748b", fontSize: 16 },
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
        list: { display: "flex", flexDirection: "column", gap: 12 },
        listItem: (active) => ({
            padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, cursor: "pointer",
            background: active ? "#ffffff" : "transparent", border: active ? "1px solid #e2e8f0" : "1px solid transparent",
            borderRadius: 12, transition: "all 0.2s", boxShadow: active ? "0 4px 12px rgba(0,0,0,0.02)" : "none"
        }),
        avatar: { width: 40, height: 40, borderRadius: "50%", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, color: "#1e293b" }
    };

    const selectedInterview = interviews.find(iv => iv.sessionId === selectedId);

    return (
        <div style={S.root}>
            <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

            <div style={S.main}>
                {activeTab === "create" ? (
                    <div style={{ maxWidth: 800, animation: "fadeUp .5s ease" }}>
                        <div style={S.header}>
                            <h1 style={S.title}>Create <span style={{ color: "#6366f1" }}>Interview</span></h1>
                            <p style={S.subtitle}>Configure the role and share the link with your candidate.</p>
                        </div>

                        {generatedLink ? (
                            <div style={{ ...S.card, marginBottom: 32, border: "1px solid #86efac", background: "#f0fdf4", textAlign: "center", padding: "40px 24px" }}>
                                <div style={{ fontSize: 48, marginBottom: 16 }}>✨</div>
                                <h3 style={{ fontSize: 20, fontWeight: 700, color: "#166534", marginBottom: 16 }}>INTERVIEW LINK GENERATED</h3>
                                <div style={{
                                    background: "#ffffff", border: "1px solid #bbf7d0", borderRadius: 12,
                                    padding: "20px", fontSize: 15, color: "#6366f1", wordBreak: "break-all",
                                    marginBottom: 24, lineHeight: 1.6, fontWeight: 600
                                }}>
                                    {generatedLink}
                                </div>
                                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                                    <button style={S.btn(true)} onClick={copyLink}>
                                        {copied ? "✓ COPIED" : "📋 COPY LINK"}
                                    </button>
                                    <button style={S.btn(false)} onClick={resetForm}>
                                        + CREATE ANOTHER
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                                <div style={S.card}>
                                    <label style={S.label}>Candidate Name</label>
                                    <input style={S.input} placeholder="e.g. John Doe" value={intervieweeName} onChange={e => setIntervieweeName(e.target.value)} />
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                                    <div style={S.card}>
                                        <label style={S.label}>Resume Content</label>
                                        <textarea style={{ ...S.textarea, minHeight: 300 }} placeholder="Paste resume here..." value={resume} onChange={e => setResume(e.target.value)} />
                                    </div>
                                    <div style={S.card}>
                                        <label style={S.label}>Job Description</label>
                                        <textarea style={{ ...S.textarea, minHeight: 300 }} placeholder="Paste JD here..." value={jd} onChange={e => setJd(e.target.value)} />
                                    </div>
                                </div>
                                {error && <div style={{ color: "#ef4444", fontSize: 14 }}>⚠ {error}</div>}
                                <div style={{ textAlign: "right" }}>
                                    <button style={S.btn(true, creating)} onClick={handleSubmit} disabled={creating}>
                                        {creating ? "GENERATING..." : "GENERATE SECURE LINK"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ display: "flex", gap: 32, height: "100%", animation: "fadeUp .5s ease" }}>
                        {/* List Area */}
                        <div style={{ width: 320, display: "flex", flexDirection: "column", gap: 20 }}>
                            <div style={S.header}>
                                <h1 style={S.title}>History</h1>
                                <p style={S.subtitle}>{interviews.length} total sessions</p>
                            </div>
                            <div style={S.list}>
                                {interviews.map(iv => (
                                    <div 
                                        key={iv.sessionId} 
                                        style={S.listItem(selectedId === iv.sessionId)}
                                        onClick={() => setSelectedId(iv.sessionId)}
                                    >
                                        <div style={S.avatar}>
                                            {iv.interviewerName.charAt(0).toUpperCase()}
                                        </div>
                                        <div style={{ flex: 1, overflow: "hidden" }}>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                {iv.interviewerName}
                                            </div>
                                            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                                                {new Date(iv.createdAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: "right" }}>
                                            <div style={{ fontSize: 15, fontWeight: 800, color: iv.evaluation ? HIRE_COLORS[iv.evaluation.hiringSuggestion] : "#94a3b8" }}>
                                                {iv.evaluation?.overallScore ?? "--"}
                                            </div>
                                            <div style={{ fontSize: 9 }}>
                                                <span style={S.badge(STATUS_COLORS[iv.status])}>{iv.status}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Detail Area */}
                        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 40 }}>
                            {selectedInterview ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                                    <div style={S.card}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                                            <div>
                                                <h1 style={{ ...S.title, fontSize: 40 }}>{selectedInterview.interviewerName}</h1>
                                                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                                    <span style={S.badge(STATUS_COLORS[selectedInterview.status])}>{selectedInterview.status}</span>
                                                    <span style={{ fontSize: 12, color: "#64748b" }}>Started on {new Date(selectedInterview.createdAt).toLocaleString()}</span>
                                                </div>
                                            </div>
                                                    {selectedInterview.evaluation && (
                                                <div style={{ textAlign: "right", minWidth: 140 }}>
                                                    <div style={{ fontSize: 56, fontWeight: 900, color: HIRE_COLORS[selectedInterview.evaluation.hiringSuggestion], fontFamily: "'Outfit', sans-serif", lineHeight: 1 }}>
                                                        {selectedInterview.evaluation.overallScore}<span style={{ fontSize: 20, color: "#94a3b8", fontWeight: 500 }}>/100</span>
                                                    </div>
                                                    <div style={{ margin: "8px 0 12px" }}>
                                                        <ScoreBar score={selectedInterview.evaluation.overallScore} color={HIRE_COLORS[selectedInterview.evaluation.hiringSuggestion]} />
                                                    </div>
                                                    <div style={{ ...S.badge(HIRE_COLORS[selectedInterview.evaluation.hiringSuggestion]), padding: "6px 16px", borderRadius: 100, fontSize: 12 }}>{selectedInterview.evaluation.hiringSuggestion}</div>
                                                </div>
                                            )}
                                        </div>

                                        {selectedInterview.evaluation ? (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                                                <div style={{ padding: 20, background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                                                    <label style={S.label}>Strategic Summary</label>
                                                    <p style={{ fontSize: 15, lineHeight: 1.7, color: "#334155" }}>{selectedInterview.evaluation.summary}</p>
                                                </div>

                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                                                    <div style={{ background: "#f0fdf4", padding: 20, borderRadius: 12, border: "1px solid #bbf7d0" }}>
                                                        <label style={{ ...S.label, color: "#166534" }}>Key Strengths</label>
                                                        {selectedInterview.evaluation.strengths.map((s, i) => <div key={i} style={{ display: "flex", gap: 10, fontSize: 13, color: "#166534", marginBottom: 8 }}><span>•</span>{s}</div>)}
                                                    </div>
                                                    <div style={{ background: "#fef2f2", padding: 20, borderRadius: 12, border: "1px solid #fecaca" }}>
                                                        <label style={{ ...S.label, color: "#991b1b" }}>Improvement Areas</label>
                                                        {selectedInterview.evaluation.weaknesses.map((w, i) => <div key={i} style={{ display: "flex", gap: 10, fontSize: 13, color: "#991b1b", marginBottom: 8 }}><span>•</span>{w}</div>)}
                                                    </div>
                                                </div>

                                                {selectedInterview.evaluation.topicScores && (
                                                    <div>
                                                        <label style={S.label}>Topic Breakdown</label>
                                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                                                            {selectedInterview.evaluation.topicScores.map((t, i) => (
                                                                <div key={i} style={{ padding: 16, background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                                                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                                                                        <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{t.topic}</span>
                                                                        <span style={{ fontSize: 12, fontWeight: 800, color: "#6366f1" }}>{t.score}</span>
                                                                    </div>
                                                                    <ScoreBar score={t.score} color="#6366f1" />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div style={{ textAlign: "center", padding: 40, background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0", color: "#64748b", marginBottom: 32 }}>
                                                <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                                                <p style={{ fontWeight: 600 }}>Interview in Progress</p>
                                                <p style={{ fontSize: 13, marginTop: 4 }}>Full AI evaluation will appear here once completed.</p>
                                            </div>
                                        )}

                                        <div>
                                            <label style={S.label}>Live / Full Interview Transcript</label>
                                            <div style={{ background: "#f1f5f9", borderRadius: 12, padding: 20, maxHeight: 400, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
                                                {(selectedInterview.transcript || []).map((t, i) => (
                                                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: t.role === "agent" ? "flex-start" : "flex-end" }}>
                                                        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>{t.role === "agent" ? "Alex (AI)" : "Candidate"}</div>
                                                        <div style={{ 
                                                            padding: "10px 14px", borderRadius: 12, maxWidth: "80%", fontSize: 13, lineHeight: 1.5,
                                                            background: t.role === "agent" ? "#ffffff" : "#6366f1",
                                                            color: t.role === "agent" ? "#1e293b" : "#ffffff",
                                                            boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                                                        }}>
                                                            {t.content}
                                                        </div>
                                                    </div>
                                                ))}
                                                {(!selectedInterview.transcript || selectedInterview.transcript.length === 0) && (
                                                    <div style={{ textAlign: "center", padding: 40, color: "#94a3b8", fontSize: 14 }}>Waiting for conversation to begin...</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
                                    <div style={{ textAlign: "center" }}>
                                        <div style={{ fontSize: 64, marginBottom: 20 }}>👈</div>
                                        <h3 style={{ fontSize: 18, fontWeight: 700, color: "#cbd5e1" }}>Select a session to view details</h3>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
