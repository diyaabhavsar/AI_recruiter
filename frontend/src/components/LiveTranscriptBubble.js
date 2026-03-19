import React, { useRef, useEffect } from "react";

export default function LiveTranscriptBubble({ transcript }) {
    const ref = useRef(null);
    useEffect(() => { ref.current?.scrollIntoView({ behavior: "smooth" }); }, [transcript]);

    if (!transcript?.length) return (
        <div style={{ textAlign: "center", color: "#64748b", fontSize: 14, padding: "40px 0" }}>
            Interview will begin shortly...
        </div>
    );

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {transcript.map((u, i) => (
                <div key={i} style={{ display: "flex", justifyContent: u.role === "agent" ? "flex-start" : "flex-end" }}>
                    <div style={{
                        maxWidth: "80%",
                        background: u.role === "agent" ? "#ffffff" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                        border: u.role === "agent" ? "1px solid #e2e8f0" : "none",
                        borderRadius: u.role === "agent" ? "4px 14px 14px 14px" : "14px 4px 14px 14px",
                        padding: "10px 14px", fontSize: 14, lineHeight: 1.6, color: u.role === "agent" ? "#334155" : "#ffffff",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
                    }}>
                        <div style={{ fontSize: 10, color: u.role === "agent" ? "#94a3b8" : "rgba(255,255,255,0.7)", marginBottom: 4, letterSpacing: "0.1em", fontWeight: 700 }}>
                            {u.role === "agent" ? "ALEX (INTERVIEWER)" : "YOU"}
                        </div>
                        {u.content}
                    </div>
                </div>
            ))}
            <div ref={ref} />
        </div>
    );
}
