import { useState, useCallback, useEffect, useRef } from "react";
import { RetellWebClient } from "retell-client-js-sdk";

import { AGENT_ID, STAGE } from "../constants/index.js";
import useCheatingMonitor from "../hooks/useCheatingMonitor.js";
import {
    generateEvaluation,
    createWebCall,
    fetchCallResult,
    getInterviewSession,
    saveInterviewResult,
} from "../services/api.js";

import VoiceOrb from "../components/VoiceOrb.js";
import LiveTranscriptBubble from "../components/LiveTranscriptBubble.js";

// ── Retell client (singleton) ─────────────────────────────────────────────────
const retellClient = new RetellWebClient();

const MAX_Q = 12;

export default function CandidateInterview({ sessionId }) {
    const [stage, setStage] = useState(STAGE.SETUP);    // setup → interview → evaluating → thankyou
    const [session, setSession] = useState(null);        // interview session from backend
    const [loadError, setLoadError] = useState(null);
    const [callId, setCallId] = useState(null);
    const [isCallActive, setIsCallActive] = useState(false);
    const [agentTalking, setAgentTalking] = useState(false);
    const [transcript, setTranscript] = useState([]);
    const [starting, setStarting] = useState(false);
    const [startError, setStartError] = useState(null);
    const [questionCount, setQuestionCount] = useState(0);
    const [liveScores, setLiveScores] = useState([]); // Added for real-time coaching
    const [coaching, setCoaching] = useState(null); // Added for real-time coaching

    const monitor = useCheatingMonitor(stage === STAGE.INTERVIEW, callId);

    // ── Refs to avoid stale closures ────────────────────────────────────────
    const callIdRef = useRef(callId);
    const transcriptRef = useRef(transcript);
    const sessionRef = useRef(session);

    useEffect(() => { callIdRef.current = callId; }, [callId]);
    useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
    useEffect(() => { sessionRef.current = session; }, [session]);

    // ── Sync video/screen refs when streams or stage changes ────────────────
    useEffect(() => {
        if (stage === STAGE.INTERVIEW) {
            if (monitor.videoRef.current && monitor.camStream) {
                monitor.videoRef.current.srcObject = monitor.camStream;
            }
            if (monitor.screenRef.current && monitor.screenStream) {
                monitor.screenRef.current.srcObject = monitor.screenStream;
            }
        }
    }, [stage, monitor.camStream, monitor.screenStream, monitor.videoRef, monitor.screenRef]);

    // ── Load interview session on mount ─────────────────────────────────────
    useEffect(() => {
        async function load() {
            try {
                const data = await getInterviewSession(sessionId);
                if (data.status === "completed") {
                    setLoadError("This interview has already been completed.");
                    return;
                }
                setSession(data);
            } catch (err) {
                setLoadError("Invalid or expired interview link.");
            }
        }
        load();
    }, [sessionId]);

    // ── Wire up Retell events (once) ────────────────────────────────────────
    useEffect(() => {
        retellClient.on("call_started", () => { setIsCallActive(true); setAgentTalking(false); });
        retellClient.on("call_ended", () => { setIsCallActive(false); handleCallEnded(); });
        retellClient.on("agent_start_talking", () => setAgentTalking(true));
        retellClient.on("agent_stop_talking", () => setAgentTalking(false));
        retellClient.on("update", (update) => {
            if (update?.transcript) {
                setTranscript([...update.transcript]);
                const agentTurns = update.transcript.filter(u => u.role === "agent").length;
                setQuestionCount(agentTurns);
            }
        });
        retellClient.on("error", (err) => {
            console.error("Retell error:", err);
            setStartError("Voice call error: " + (err?.message || String(err)));
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Live performance polling (Coaching) ──────────────────────────────────
    useEffect(() => {
        if (stage !== STAGE.INTERVIEW || !callId) return;
        const poll = async () => {
            try {
                const data = await fetchCallResult(callId);
                if (data.answerScores) {
                    setLiveScores(data.answerScores);
                    const last = data.answerScores[data.answerScores.length - 1];
                    if (last?.coaching) setCoaching(last.coaching);
                }
            } catch { /* silent */ }
        };
        const interval = setInterval(poll, 4000);
        return () => clearInterval(interval);
    }, [stage, callId]);

    // ── Start interview (request all permissions → start call) ──────────────
    const startInterview = async () => {
        setStarting(true);
        setStartError(null);

        // Step 1: Camera permission
        let camStream;
        try {
            camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            monitor.setCamStreamDirect(camStream);
        } catch {
            setStartError("📹 Camera permission is required. Please allow camera access and try again.");
            setStarting(false);
            return;
        }

        // Step 2: Screen share permission
        let screenStream;
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            monitor.setScreenStreamDirect(screenStream);
        } catch {
            camStream.getTracks().forEach(t => t.stop());
            monitor.stopAll();
            setStartError("🖥️ Screen sharing is required. Please share your screen and try again.");
            setStarting(false);
            return;
        }

        // Step 3: Create the web call (backend fetches resume/JD from the session)
        try {
            const sessionData = sessionRef.current;
            const { access_token, call_id } = await createWebCall(
                sessionData.resume || "Fetched from session",
                sessionData.jobDescription || "Fetched from session",
                AGENT_ID,
                "",  // retellKey   – use backend default
                "",  // groqKey     – use backend default
                sessionId,
            );
            setCallId(call_id);

            // Step 4: Start Retell call (requests microphone permission)
            try {
                await retellClient.startCall({ accessToken: access_token, sampleRate: 24000 });
            } catch {
                camStream.getTracks().forEach(t => t.stop());
                screenStream.getTracks().forEach(t => t.stop());
                monitor.stopAll();
                setStartError("🎙️ Microphone permission is required. Please allow microphone access and try again.");
                setStarting(false);
                return;
            }

            setStage(STAGE.INTERVIEW);
        } catch (err) {
            setStartError(err.message);
            camStream.getTracks().forEach(t => t.stop());
            screenStream.getTracks().forEach(t => t.stop());
            monitor.stopAll();
        } finally {
            setStarting(false);
        }
    };

    // ── End call ────────────────────────────────────────────────────────────
    const endCall = async () => {
        retellClient.stopCall();
    };

    // ── Handle call ended → evaluate → save result ──────────────────────────
    const handleCallEnded = useCallback(async () => {
        monitor.stopAll();
        setStage(STAGE.EVALUATING);

        const currentCallId = callIdRef.current;
        const currentTranscript = transcriptRef.current;

        console.log("📞 Call ended. callId:", currentCallId, "transcript:", currentTranscript?.length);

        await new Promise(r => setTimeout(r, 1500));

        try {
            let result = null;
            if (currentCallId) {
                result = await fetchCallResult(currentCallId);
            }

            // Prevent backend race condition by choosing the longest transcript
            const t1 = result?.transcript || [];
            const t2 = currentTranscript || [];
            const finalTranscript = t1.length > t2.length ? t1 : t2;

            const candidateAnswers = finalTranscript.filter(u => u.role === "user").length;
            const MIN_ANSWERS = 3;

            let evalData;
            if (candidateAnswers < MIN_ANSWERS) {
                evalData = {
                    overallScore: 0,
                    hiringSuggestion: "No Hire",
                    summary: `Conversation too short — the candidate only answered ${candidateAnswers} question(s) out of a minimum of ${MIN_ANSWERS}.`,
                    strengths: [],
                    weaknesses: ["Insufficient interview data to evaluate the candidate."],
                    topicScores: [],
                    recommendation: `The interview was too short to make a hiring decision. The candidate answered only ${candidateAnswers} question(s). Please conduct a full interview.`,
                    tooShort: true,
                };
            } else {
                evalData = await generateEvaluation(
                    finalTranscript,
                    result?.answerScores ?? [],
                    result?.resume ?? "",
                    result?.jobDescription ?? "",
                    "",
                    candidateAnswers,
                    MAX_Q
                );
            }

            const fullEval = { ...evalData, flags: monitor.flags, tabSwitches: monitor.tabSwitches };

            // Save the result back to the backend
            try {
                await saveInterviewResult(sessionId, fullEval, candidateAnswers);
                console.log("✅ Interview result saved to backend");
            } catch (e) {
                console.warn("Failed to save result:", e);
            }

            setQuestionCount(candidateAnswers); // accurately show on Thank You screen
            setStage(STAGE.THANKYOU);
        } catch (e) {
            console.error("Evaluation error:", e);
            setStage(STAGE.THANKYOU);
        }
    }, [monitor, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

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
        card: { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.03)" },
        btn: (primary, disabled) => ({
            padding: "14px 28px", borderRadius: 8, border: primary ? "none" : "1px solid #e2e8f0",
            cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 13,
            letterSpacing: "0.05em", transition: "all 0.2s",
            background: primary ? (disabled ? "#cbd5e1" : "linear-gradient(135deg, #6366f1, #8b5cf6)") : "#ffffff",
            color: disabled ? "#94a3b8" : primary ? "#ffffff" : "#4f46e5",
            opacity: disabled ? 0.7 : 1,
            boxShadow: primary && !disabled ? "0 4px 10px rgba(99, 102, 241, 0.3)" : "none",
        }),
        label: { fontSize: 11, letterSpacing: "0.08em", color: "#64748b", textTransform: "uppercase", marginBottom: 8, display: "block", fontWeight: 600 },
    };

    // ══════════════════════════════════════════════════════════════════════════
    //  RENDER: Loading / Error
    // ══════════════════════════════════════════════════════════════════════════
    if (loadError) return (
        <div style={{ ...S.root, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, minHeight: "100vh" }}>
            <div style={{ fontSize: 48 }}>❌</div>
            <p style={{ color: "#ef4444", fontSize: 18, fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>{loadError}</p>
            <p style={{ color: "#64748b", fontSize: 14 }}>Please contact the interviewer for a new link.</p>
        </div>
    );

    if (!session) return (
        <div style={{ ...S.root, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, minHeight: "100vh" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #6366f1", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
            <p style={{ color: "#4f46e5", fontSize: 14, letterSpacing: "0.1em", fontWeight: 600 }}>LOADING INTERVIEW...</p>
        </div>
    );

    // ══════════════════════════════════════════════════════════════════════════
    //  RENDER: SETUP (Join screen — minimal, just a start button)
    // ══════════════════════════════════════════════════════════════════════════
    if (stage === STAGE.SETUP) return (
        <div style={{ ...S.root, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
            <div style={{ textAlign: "center", maxWidth: 500, padding: "0 20px", animation: "fadeUp .5s ease" }}>
                <div style={{ fontSize: 56, marginBottom: 20 }}>🎙️</div>
                <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 36, fontWeight: 800, marginBottom: 12, letterSpacing: "-0.02em", color: "#0f172a" }}>
                    AI Voice <span style={{ color: "#6366f1" }}>Interview</span>
                </h1>
                <p style={{ color: "#475569", fontSize: 15, lineHeight: 1.7, marginBottom: 8 }}>
                    Hello <strong style={{ color: "#4f46e5" }}>{session.interviewerName}</strong>
                </p>
                <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6, marginBottom: 32 }}>
                    This is a voice-based interview with an AI interviewer. You'll need to grant<br />
                    camera, screen sharing, and microphone permissions to proceed.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", marginBottom: 32 }}>
                    {["📹 Camera access", "🖥️ Screen sharing", "🎙️ Microphone access"].map(p => (
                        <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#64748b", fontWeight: 500 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#cbd5e1" }} />
                            {p} required
                        </div>
                    ))}
                </div>

                {startError && (
                    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", marginBottom: 24, fontSize: 13, color: "#dc2626", textAlign: "left", fontWeight: 500 }}>
                        ⚠ {startError}
                    </div>
                )}

                <button
                    style={S.btn(true, starting)}
                    onClick={startInterview}
                    disabled={starting}
                >
                    {starting ? "⏳ CONNECTING..." : "▶ JOIN INTERVIEW"}
                </button>
                <p style={{ color: "#94a3b8", fontSize: 12, marginTop: 12 }}>
                    Permissions will be requested when you click the button
                </p>
            </div>
        </div>
    );

    // ══════════════════════════════════════════════════════════════════════════
    //  RENDER: INTERVIEW
    // ══════════════════════════════════════════════════════════════════════════
    if (stage === STAGE.INTERVIEW) return (
        <div style={{ ...S.root, display: "flex", flexDirection: "column", height: "100vh" }}>
            <div style={S.header}>
                <div style={S.logo}><span>◈</span> LIVE INTERVIEW</div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={S.badge("#10b981")}>Q {questionCount}/{MAX_Q}</span>
                    {isCallActive && <span style={{ ...S.badge("#ef4444"), animation: "breathe 2s infinite" }}>● REC</span>}
                    <button style={S.btn(false)} onClick={endCall}>End Interview</button>
                </div>
            </div>

            {/* Progress bar */}
            <div style={{ height: 3, background: "#e2e8f0" }}>
                <div style={{ height: "100%", background: "linear-gradient(90deg, #6366f1, #8b5cf6)", width: `${(questionCount / MAX_Q) * 100}%`, transition: "width .5s" }} />
            </div>

            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                {/* Centre: Orb + transcript */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 24px 20px", borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
                        <VoiceOrb talking={agentTalking} listening={isCallActive && !agentTalking} />
                        <div style={{ marginTop: 24, fontSize: 13, color: "#64748b", letterSpacing: "0.1em", fontWeight: 600 }}>
                            {agentTalking ? "ALEX IS SPEAKING..." : isCallActive ? "LISTENING..." : "CONNECTING..."}
                        </div>
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px", background: "#f8fafc" }}>
                        <LiveTranscriptBubble transcript={transcript} />
                    </div>
                </div>

                {/* Right sidebar: proctoring */}
                <div style={{ width: 260, borderLeft: "1px solid #e2e8f0", overflowY: "auto", background: "#ffffff", padding: 20, display: "flex", flexDirection: "column", gap: 24, boxShadow: "-4px 0 15px rgba(0,0,0,0.02)" }}>
                    <div>
                        <label style={S.label}>📹 Camera</label>
                        {monitor.camStream
                            ? <video ref={monitor.videoRef} autoPlay muted style={{ width: "100%", borderRadius: 12, border: "1px solid #e2e8f0", background: "#1e293b", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }} />
                            : <div style={{ ...S.card, textAlign: "center", padding: 20, background: "#f8fafc" }}>
                                <div style={{ fontSize: 24, marginBottom: 12 }}>📷</div>
                                <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16 }}>{monitor.camError || "Not started"}</div>
                                <button style={{ ...S.btn(false), fontSize: 12, padding: "8px 16px" }} onClick={monitor.startCamera}>Enable</button>
                            </div>
                        }
                    </div>
                    <div>
                        <label style={S.label}>🖥 Screen</label>
                        {monitor.screenStream
                            ? <video ref={monitor.screenRef} autoPlay muted style={{ width: "100%", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }} />
                            : <div style={{ ...S.card, textAlign: "center", padding: 20, background: "#f8fafc" }}>
                                <div style={{ fontSize: 24, marginBottom: 12 }}>🖥️</div>
                                <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16 }}>{monitor.screenError || "Optional"}</div>
                                <button style={{ ...S.btn(false), fontSize: 12, padding: "8px 16px" }} onClick={monitor.startScreen}>Share</button>
                            </div>
                        }
                    </div>
                    <div style={{ ...S.card, background: "#f8fafc" }}>
                        <label style={S.label}>🛡 Integrity</label>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
                            <span style={{ color: "#64748b" }}>Tab switches</span>
                            <span style={{ color: monitor.tabSwitches > 0 ? "#ef4444" : "#10b981", fontWeight: 700 }}>{monitor.tabSwitches}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                            <span style={{ color: "#64748b" }}>Flags</span>
                            <span style={{ color: monitor.flags.length > 0 ? "#ef4444" : "#10b981", fontWeight: 700 }}>{monitor.flags.length}</span>
                        </div>
                    </div>

                    {/* Live Performance / Coaching */}
                    <div style={{ ...S.card, background: "linear-gradient(135deg, #f8fafc, #f1f5f9)", border: "1px solid #e2e8f0" }}>
                        <label style={S.label}>📉 Live Performance</label>
                        <div style={{ height: 6, background: "#e2e8f0", borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
                            <div style={{
                                height: "100%",
                                width: `${(liveScores.reduce((acc, s) => acc + s.score, 0) / (liveScores.length || 1)) * 10}%`,
                                background: liveScores.length > 0 && (liveScores.reduce((acc, s) => acc + s.score, 0) / liveScores.length) > 7 ? "#10b981" : "#f59e0b",
                                transition: "all 0.5s ease"
                            }} />
                        </div>
                        {coaching && (
                            <div style={{ animation: "fadeUp 0.3s ease" }}>
                                <label style={{ ...S.label, color: "#6366f1", fontSize: 10 }}>AI COACH TIP</label>
                                <p style={{ fontSize: 12, lineHeight: 1.5, color: "#1e293b", fontWeight: 500 }}>"{coaching}"</p>
                            </div>
                        )}
                        {!coaching && <p style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>Awaiting first answer evaluation...</p>}
                    </div>
                </div>
            </div>
        </div>
    );

    // ══════════════════════════════════════════════════════════════════════════
    //  RENDER: EVALUATING
    // ══════════════════════════════════════════════════════════════════════════
    if (stage === STAGE.EVALUATING) return (
        <div style={{ ...S.root, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 24, minHeight: "100vh" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", border: "4px solid #6366f1", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
            <div style={{ color: "#4f46e5", fontSize: 14, letterSpacing: "0.12em", fontWeight: 600 }}>GENERATING EVALUATION...</div>
            <div style={{ color: "#64748b", fontSize: 13 }}>Please wait while we analyze your interview</div>
        </div>
    );

    // ══════════════════════════════════════════════════════════════════════════
    //  RENDER: THANK YOU
    // ══════════════════════════════════════════════════════════════════════════
    return (
        <div style={{ ...S.root, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
            <div style={{ textAlign: "center", maxWidth: 520, padding: "0 20px", animation: "fadeUp .5s ease" }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
                <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 40, fontWeight: 800, marginBottom: 12, letterSpacing: "-0.02em", color: "#0f172a" }}>
                    Thank <span style={{ color: "#6366f1" }}>You!</span>
                </h1>
                <p style={{ color: "#475569", fontSize: 15, lineHeight: 1.8, marginBottom: 24 }}>
                    Your interview has been completed and your responses have been recorded.
                    The interviewer will review your results shortly.
                </p>
                <div style={{
                    background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 16,
                    padding: "24px", display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.03)"
                }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                        <span style={{ color: "#64748b", fontWeight: 500 }}>Questions answered</span>
                        <span style={{ color: "#4f46e5", fontWeight: 700 }}>{questionCount}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                        <span style={{ color: "#64748b", fontWeight: 500 }}>Tab switches</span>
                        <span style={{ color: monitor.tabSwitches > 0 ? "#ef4444" : "#10b981", fontWeight: 700 }}>{monitor.tabSwitches}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                        <span style={{ color: "#64748b", fontWeight: 500 }}>Integrity flags</span>
                        <span style={{ color: monitor.flags.length > 0 ? "#ef4444" : "#10b981", fontWeight: 700 }}>{monitor.flags.length}</span>
                    </div>
                </div>
                <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 24, fontWeight: 500 }}>
                    You may close this window now.
                </p>
            </div>
        </div>
    );
}
