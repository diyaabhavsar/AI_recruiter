import React from 'react';

export default function ScoreBar({ score, max = 100, color = "#a78bfa" }) {
    return (
        <div style={{ background: "#1a1530", borderRadius: 6, height: 8, overflow: "hidden", width: "100%" }}>
            <div style={{
                width: `${(score / max) * 100}%`, height: "100%",
                background: `linear-gradient(90deg, ${color}, ${color}bb)`,
                borderRadius: 6, transition: "width 1.2s cubic-bezier(.4,0,.2,1)",
            }} />
        </div>
    );
}
