import React from "react";

const S = {
    sidebar: {
        width: 280,
        height: "100vh",
        background: "#0f172a",
        color: "#f8fafc",
        display: "flex",
        flexDirection: "column",
        padding: "24px 16px",
        position: "fixed",
        left: 0,
        top: 0,
        zIndex: 1000,
        boxShadow: "4px 0 20px rgba(0,0,0,0.1)"
    },
    logo: {
        fontSize: 20,
        fontWeight: 800,
        color: "#ffffff",
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 48,
        padding: "0 12px",
        fontFamily: "'Outfit', sans-serif",
        letterSpacing: "-0.02em"
    },
    nav: {
        display: "flex",
        flexDirection: "column",
        gap: 8,
        flex: 1
    },
    navItem: (active) => ({
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderRadius: 12,
        cursor: "pointer",
        transition: "all 0.2s",
        background: active ? "rgba(99, 102, 241, 0.15)" : "transparent",
        color: active ? "#818cf8" : "#94a3b8",
        fontWeight: active ? 700 : 500,
        fontSize: 14,
        border: "none",
        textAlign: "left",
        width: "100%"
    }),
    footer: {
        padding: "16px 12px",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        marginTop: "auto"
    },
    badge: {
        fontSize: 10,
        padding: "4px 8px",
        borderRadius: 6,
        background: "rgba(99, 102, 241, 0.2)",
        color: "#818cf8",
        fontWeight: 700,
        marginLeft: "auto"
    }
};

export default function Sidebar({ activeTab, onTabChange }) {
    const tabs = [
        { id: "create", label: "Create Interview", icon: "⊕" },
        { id: "history", label: "Interview History", icon: "📊" },
    ];

    return (
        <div style={S.sidebar}>
            <div style={S.logo}>
                <span style={{ 
                    width: 32, 
                    height: 32, 
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)", 
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16
                }}>◈</span>
                mQualiFire
            </div>

            <nav style={S.nav}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        style={S.navItem(activeTab === tab.id)}
                        onClick={() => onTabChange(tab.id)}
                    >
                        <span style={{ fontSize: 18 }}>{tab.icon}</span>
                        {tab.label}
                        {tab.id === "history" && <span style={S.badge}>LIVE</span>}
                    </button>
                ))}
            </nav>

            <div style={S.footer}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ 
                        width: 36, 
                        height: 36, 
                        borderRadius: "50%", 
                        background: "#334155", 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "center",
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#f8fafc"
                    }}>R</div>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Recruiter</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>Admin Access</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
