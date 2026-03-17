import React from 'react';

export default function VoiceOrb({ talking, listening }) {
    return (
        <div style={{ position: "relative", width: 120, height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {/* Outer pulse rings */}
            {talking && [1, 2, 3].map(i => (
                <div key={i} style={{
                    position: "absolute", borderRadius: "50%",
                    width: 120 + i * 28, height: 120 + i * 28,
                    border: "1px solid rgba(99,102,241,0.3)",
                    animation: `orbPulse ${0.8 + i * 0.3}s ease-out ${i * 0.15}s infinite`,
                }} />
            ))}
            {/* Core orb */}
            <div style={{
                width: 100, height: 100, borderRadius: "50%",
                background: talking
                    ? "radial-gradient(circle at 35% 35%, #c7d2fe, #6366f1, #4338ca)"
                    : listening
                        ? "radial-gradient(circle at 35% 35%, #a7f3d0, #10b981, #047857)"
                        : "radial-gradient(circle at 35% 35%, #e2e8f0, #cbd5e1, #94a3b8)",
                boxShadow: talking
                    ? "0 0 40px rgba(99,102,241,0.4), 0 0 80px rgba(99,102,241,0.2)"
                    : listening
                        ? "0 0 40px rgba(16,185,129,0.4), 0 0 80px rgba(16,185,129,0.2)"
                        : "0 0 20px rgba(148,163,184,0.3)",
                transition: "all 0.3s ease",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 32,
            }}>
                {talking ? "🎙" : listening ? "👂" : "💤"}
            </div>
        </div>
    );
}
