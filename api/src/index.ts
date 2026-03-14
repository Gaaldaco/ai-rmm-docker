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
import { setupAgentWebSocket } from "./ws/agentSocket.js";

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
  const arch = req.params.arch; // e.g. "linux-amd64", "linux-arm64", "windows-amd64"
  const isWindows = arch.startsWith("windows-");
  const filename = `ai-remote-agent-${arch}${isWindows ? ".exe" : ""}`;
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
  const frontendUrl = process.env.API_URL || `${protocol}://${host}`;
  // Agents connect directly to the API (port 8080), not through nginx
  const hostWithoutPort = (host as string).split(":")[0];
  const apiUrl = process.env.API_URL || `${protocol}://${hostWithoutPort}:${process.env.API_PORT || 8080}`;
  const script = [
    '#!/bin/bash',
    'set -e',
    '',
    '# AI Remote Agent Installer',
    '',
    '# Re-run as root if not already',
    'if [ "$EUID" -ne 0 ]; then',
    '  echo "Root required. Re-running with sudo..."',
    `  exec sudo bash -c "$(curl -sSL '${frontendUrl}/install.sh')"`,
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
    '# Create service account',
    'if ! id -u airagent >/dev/null 2>&1; then',
    '  useradd --system --shell /usr/sbin/nologin --home-dir /etc/ai-remote-agent airagent',
    '  echo "Created airagent service account"',
    'fi',
    '',
    '# Grant passwordless sudo',
    'cat > /etc/sudoers.d/airagent <<\'SUDOERS\'',
    'airagent ALL=(ALL) NOPASSWD: ALL',
    'SUDOERS',
    'chmod 440 /etc/sudoers.d/airagent',
    '',
    '# Add to adm group for log access',
    'usermod -aG adm airagent 2>/dev/null || true',
    '',
    '# Install binary and config',
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
    'tls_skip_verify: false',
    'CONF',
    'chmod 600 /etc/ai-remote-agent/config.yaml',
    'chown -R airagent:airagent /etc/ai-remote-agent /var/log/ai-remote-agent',
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
    'User=airagent',
    'Group=airagent',
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

// ─── Windows install script endpoint ─────────────────────────────────────────
app.get("/install.ps1", (req, res) => {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
  const hostWithoutPort = (host as string).split(":")[0];
  const apiUrl = process.env.API_URL || `${protocol}://${hostWithoutPort}:${process.env.API_PORT || 8080}`;
  const script = [
    '# AI Remote Agent Installer for Windows',
    '# Run as Administrator: irm http://SERVER:3000/install.ps1 | iex',
    '',
    '# Check for Administrator privileges',
    'if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {',
    '    Write-Host "Error: Please run as Administrator" -ForegroundColor Red',
    '    Write-Host "Right-click PowerShell and select Run as Administrator"',
    '    exit 1',
    '}',
    '',
    `$ApiUrl = if ($env:API_URL) { $env:API_URL } else { "${apiUrl}" }`,
    '',
    'Write-Host "=== AI Remote Agent Installer (Windows) ===" -ForegroundColor Cyan',
    'Write-Host "API:  $ApiUrl"',
    'Write-Host "Arch: windows-amd64"',
    'Write-Host ""',
    '',
    '# Download binary',
    'Write-Host "Downloading agent binary..."',
    '$binDir = "C:\\ProgramData\\ai-remote-agent"',
    'New-Item -ItemType Directory -Force -Path $binDir | Out-Null',
    '$binPath = "$binDir\\ai-remote-agent.exe"',
    'try {',
    '    Invoke-WebRequest -Uri "$ApiUrl/api/agents/download/windows-amd64" -OutFile $binPath -UseBasicParsing',
    '} catch {',
    '    Write-Host "Error: Failed to download binary - $_" -ForegroundColor Red',
    '    exit 1',
    '}',
    'Write-Host "Download complete."',
    '',
    '# Register with API',
    '$AgentName = $env:COMPUTERNAME',
    '$OsInfo = (Get-CimInstance Win32_OperatingSystem).Caption',
    '$Arch = $env:PROCESSOR_ARCHITECTURE',
    '',
    '$body = @{',
    '    name = $AgentName',
    '    hostname = $AgentName',
    '    os = $OsInfo',
    '    arch = $Arch',
    '    platform = "windows"',
    '} | ConvertTo-Json',
    '',
    'Write-Host ""',
    'Write-Host "Registering agent..."',
    'try {',
    '    $response = Invoke-RestMethod -Uri "$ApiUrl/api/agents/register" -Method Post -Body $body -ContentType "application/json"',
    '} catch {',
    '    Write-Host "Error: Registration failed - $_" -ForegroundColor Red',
    '    exit 1',
    '}',
    '',
    '$ApiKey = $response.apiKey',
    '$AgentId = $response.id',
    '',
    'if (-not $ApiKey) {',
    '    Write-Host "Error: Registration failed. No API key returned." -ForegroundColor Red',
    '    exit 1',
    '}',
    '',
    'Write-Host "Registered! Agent ID: $AgentId" -ForegroundColor Green',
    'Write-Host ""',
    'Write-Host "  API Key: $ApiKey"',
    'Write-Host "  SAVE THIS KEY - it will NOT be shown again." -ForegroundColor Yellow',
    'Write-Host ""',
    '',
    '# Write config',
    '$configContent = @"',
    'api_url: "$ApiUrl"',
    'api_key: "$ApiKey"',
    'agent_name: "$AgentName"',
    'snapshot_interval: 60',
    'heartbeat_interval: 30',
    'tls_skip_verify: false',
    '"@',
    '$configContent | Set-Content "$binDir\\config.yaml" -Encoding UTF8',
    '',
    '# Install as Windows Service using sc.exe',
    'Write-Host "Installing Windows service..."',
    '$serviceName = "AIRemoteAgent"',
    '',
    '# Stop and remove existing service if present',
    'if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {',
    '    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue',
    '    sc.exe delete $serviceName | Out-Null',
    '    Start-Sleep -Seconds 2',
    '}',
    '',
    '# Create the service using nssm-style wrapper or native sc',
    '# Since Go binaries need a service wrapper, we use a scheduled task as an alternative',
    '# that auto-starts and restarts on failure',
    '$action = New-ScheduledTaskAction -Execute $binPath',
    '$trigger = New-ScheduledTaskTrigger -AtStartup',
    '$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest',
    '$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 9999 -RestartInterval (New-TimeSpan -Minutes 1)',
    '',
    '# Remove existing task if present',
    'Unregister-ScheduledTask -TaskName $serviceName -Confirm:$false -ErrorAction SilentlyContinue',
    '',
    'Register-ScheduledTask -TaskName $serviceName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "AI Remote Service Agent" | Out-Null',
    '',
    '# Start immediately',
    'Start-ScheduledTask -TaskName $serviceName',
    '',
    'Write-Host ""',
    'Write-Host "=== Installation Complete ===" -ForegroundColor Green',
    'Write-Host "Binary:  $binPath"',
    'Write-Host "Config:  $binDir\\config.yaml"',
    'Write-Host "Task:    $serviceName (Scheduled Task)"',
    'Write-Host "Status:  Get-ScheduledTask -TaskName $serviceName"',
    'Write-Host "Logs:    Get-ScheduledTaskInfo -TaskName $serviceName"',
    'Write-Host ""',
  ].join('\r\n');
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

// ─── WebSocket server for agent connections ─────────────────────────────────
// Must be registered BEFORE the dashboard /ws server to avoid path conflicts
setupAgentWebSocket(server);

// ─── WebSocket server for frontend real-time updates ────────────────────────
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/ws/dashboard") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  }
  // /ws/agent is handled by setupAgentWebSocket
});

wss.on("connection", (ws) => {
  console.log("[ws] Dashboard client connected");
  ws.on("close", () => console.log("[ws] Dashboard client disconnected"));
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
