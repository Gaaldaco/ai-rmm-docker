import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { WebSocketServer } from "ws";
import path from "node:path";
import fs from "node:fs";

import agentsRouter from "./routes/agents.js";
import snapshotsRouter from "./routes/snapshots.js";
import alertsRouter from "./routes/alerts.js";
import servicesRouter from "./routes/services.js";
import knowledgeBaseRouter from "./routes/knowledgeBase.js";
import remediationRouter from "./routes/remediation.js";
import consoleRouter, { purgeOldSessions } from "./routes/console.js";
import setupRouter from "./routes/setup.js";
import { errorHandler } from "./middleware/error.js";
import { startHeartbeatMonitor } from "./lib/heartbeat.js";

const app = express();
const PORT = Number(process.env.PORT ?? 8080);

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet());

// Self-hosted tool with API-key auth — allow all origins
app.use(cors({ origin: true, credentials: true }));

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "2mb" }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ai-remote-service-api", timestamp: new Date().toISOString() });
});

// ─── Agent binary download ──────────────────────────────────────────────────
const AGENT_BIN_DIR = path.resolve("agent-bin");

app.get("/api/agents/download/:arch", (req, res) => {
  const arch = req.params.arch; // e.g. "linux-amd64", "linux-arm64"
  const filename = `ai-remote-agent-${arch}`;
  const filepath = path.join(AGENT_BIN_DIR, filename);

  if (!fs.existsSync(filepath)) {
    res.status(404).json({ error: `Agent binary not found for ${arch}. Available: ${fs.existsSync(AGENT_BIN_DIR) ? fs.readdirSync(AGENT_BIN_DIR).join(", ") : "none"}` });
    return;
  }

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.sendFile(filepath);
});

// ─── Install script endpoint ─────────────────────────────────────────────────
app.get("/install.sh", (req, res) => {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
  const apiUrl = process.env.API_URL || `${protocol}://${host}`;
  const script = [
    '#!/bin/bash',
    'set -e',
    '',
    '# AI Remote Agent Installer',
    '',
    'if [ "$EUID" -ne 0 ]; then',
    '  echo "Error: Please run as root"',
    '  exit 1',
    'fi',
    '',
    `API_URL="\${API_URL:-${apiUrl}}"`,
    '',
    '# Detect architecture',
    'ARCH=$(uname -m)',
    'case $ARCH in',
    '  x86_64)    BINARY_ARCH="linux-amd64" ;;',
    '  aarch64|arm64) BINARY_ARCH="linux-arm64" ;;',
    '  *) echo "Error: Unsupported architecture: $ARCH"; exit 1 ;;',
    'esac',
    '',
    'echo "=== AI Remote Agent Installer ==="',
    'echo "API:  $API_URL"',
    'echo "Arch: $ARCH ($BINARY_ARCH)"',
    'echo ""',
    '',
    '# Download binary from API',
    'echo "Downloading agent binary..."',
    'HTTP_CODE=$(curl -sL -w "%{http_code}" -o /tmp/ai-remote-agent "${API_URL}/api/agents/download/${BINARY_ARCH}")',
    'if [ "$HTTP_CODE" != "200" ]; then',
    '  echo "Error: Failed to download binary (HTTP $HTTP_CODE)"',
    '  exit 1',
    'fi',
    'echo "Download complete."',
    '',
    '# Agent name (use hostname — rename in dashboard if needed)',
    'AGENT_NAME="$(hostname)"',
    '',
    '# Detect OS',
    'OS_INFO=$(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d\'"\' -f2 || uname -o)',
    '',
    '# Build JSON payload safely',
    'JSON_PAYLOAD=$(printf \'{"name":"%s","hostname":"%s","os":"%s","arch":"%s","platform":"linux"}\' \\',
    '  "$AGENT_NAME" "$(hostname)" "$OS_INFO" "$ARCH")',
    '',
    '# Register with API',
    'echo ""',
    'echo "Registering agent..."',
    'RESPONSE=$(curl -s -X POST "${API_URL}/api/agents/register" \\',
    '  -H "Content-Type: application/json" \\',
    '  -d "$JSON_PAYLOAD")',
    '',
    'API_KEY=$(echo "$RESPONSE" | grep -o \'"apiKey":"[^"]*"\' | cut -d\'"\' -f4)',
    'AGENT_ID=$(echo "$RESPONSE" | grep -o \'"id":"[^"]*"\' | cut -d\'"\' -f4)',
    '',
    'if [ -z "$API_KEY" ]; then',
    '  echo "Error: Registration failed. Response: $RESPONSE"',
    '  exit 1',
    'fi',
    '',
    'echo "Registered! Agent ID: $AGENT_ID"',
    'echo ""',
    'echo "  API Key: $API_KEY"',
    'echo "  SAVE THIS KEY — it will NOT be shown again."',
    'echo ""',
    '',
    '# Install',
    'mkdir -p /etc/ai-remote-agent /var/log/ai-remote-agent',
    'mv /tmp/ai-remote-agent /usr/local/bin/ai-remote-agent',
    'chmod +x /usr/local/bin/ai-remote-agent',
    '',
    'cat > /etc/ai-remote-agent/config.yaml <<CONF',
    'api_url: "${API_URL}"',
    'api_key: "${API_KEY}"',
    'agent_name: "${AGENT_NAME}"',
    'snapshot_interval: 60',
    'heartbeat_interval: 30',
    'command_poll_interval: 5',
    'CONF',
    'chmod 600 /etc/ai-remote-agent/config.yaml',
    '',
    'cat > /etc/systemd/system/ai-remote-agent.service <<SVC',
    '[Unit]',
    'Description=AI Remote Service Agent',
    'After=network-online.target',
    'Wants=network-online.target',
    '',
    '[Service]',
    'Type=simple',
    'ExecStart=/usr/local/bin/ai-remote-agent',
    'Restart=always',
    'RestartSec=10',
    'User=root',
    'StandardOutput=journal',
    'StandardError=journal',
    'SyslogIdentifier=ai-remote-agent',
    '',
    '[Install]',
    'WantedBy=multi-user.target',
    'SVC',
    '',
    'systemctl daemon-reload',
    'systemctl enable ai-remote-agent',
    'systemctl start ai-remote-agent',
    '',
    'echo ""',
    'echo "=== Installation Complete ==="',
    'echo "Binary:  /usr/local/bin/ai-remote-agent"',
    'echo "Config:  /etc/ai-remote-agent/config.yaml"',
    'echo "Logs:    journalctl -u ai-remote-agent -f"',
    'echo "Status:  systemctl status ai-remote-agent"',
    'echo ""',
  ].join('\n');
  res.setHeader("Content-Type", "text/plain");
  res.send(script);
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/agents", agentsRouter);
app.use("/api/snapshots", snapshotsRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/services", servicesRouter);
app.use("/api/knowledge-base", knowledgeBaseRouter);
app.use("/api/remediation", remediationRouter);
app.use("/api/console", consoleRouter);
app.use("/api/setup", setupRouter);

// ─── Error handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[api] AI Remote Service API listening on port ${PORT}`);
});

// ─── WebSocket server for real-time updates ──────────────────────────────────
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  console.log("[ws] Client connected");
  ws.on("close", () => console.log("[ws] Client disconnected"));
});

// Export for use by workers to broadcast events
export function broadcast(event: string, data: unknown) {
  const message = JSON.stringify({ event, data });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// ─── Background tasks ────────────────────────────────────────────────────────
startHeartbeatMonitor();

// Purge expired console sessions every hour
setInterval(purgeOldSessions, 60 * 60 * 1000);
purgeOldSessions(); // run once on startup
