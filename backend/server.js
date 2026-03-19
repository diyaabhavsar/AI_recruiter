/**
 * AI Interviewer Backend
 * ─────────────────────────────────────────────────────────────────
 * Express server exposing APIs and WebSockets.
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import apiRoutes from "./routes/api.js";
import { setupLlmWebSocket } from "./websockets/llm.js";
import { retell } from "./services/clients.js";

const app = express();
const http = createServer(app);

// Middlewares
app.use(cors());
app.use(express.json());

// Logging
app.use((req, res, next) => {
    console.log(`🌐 [${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// REST Routes
app.use("/", apiRoutes);

// Initialize WebSocket handler for Retell (Live LLM)
setupLlmWebSocket(http);

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3001;
http.listen(PORT, () => {
    console.log(`\n🚀 AI Interviewer backend running on port ${PORT}`);
    console.log(`   WebSocket LLM endpoint: ws://localhost:${PORT}/llm-websocket`);
    console.log(`   Create web call:        POST http://localhost:${PORT}/create-web-call`);
    console.log(`   One-time agent setup:   GET  http://localhost:${PORT}/setup-agent`);
    console.log(`\n   ⚠️  Don't forget to set PUBLIC_URL in .env and run /setup-agent once!\n`);

    // Clear agent begin_message so our WebSocket controls the greeting
    const agentId = process.env.RETELL_AGENT_ID;
    if (agentId) {
        retell.agent.update(agentId, { begin_message: "" })
            .then(() => console.log(`✅ Agent begin_message cleared — WebSocket controls greeting`))
            .catch(e => console.warn(`⚠️  Could not clear agent begin_message: ${e.message}`));
    }
});