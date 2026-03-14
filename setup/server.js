import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = process.env.ENV_PATH || "/data/.env";
const PORT = 3000;

function getPage(error = "", success = false) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Remote Service — Setup</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0f;
      color: #e5e5e5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      width: 100%;
      max-width: 540px;
      padding: 20px;
    }
    .card {
      background: #111118;
      border: 1px solid #1e1e2e;
      border-radius: 12px;
      padding: 32px;
    }
    .logo {
      text-align: center;
      margin-bottom: 24px;
    }
    .logo h1 {
      font-size: 20px;
      font-weight: 700;
      color: #fff;
    }
    .logo p {
      font-size: 13px;
      color: #666;
      margin-top: 4px;
    }
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #888;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #1e1e2e;
    }
    .field {
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: #ccc;
      margin-bottom: 6px;
    }
    label .required {
      color: #ef4444;
      margin-left: 2px;
    }
    label .hint {
      font-weight: 400;
      color: #555;
      font-size: 11px;
      display: block;
      margin-top: 2px;
    }
    input, select {
      width: 100%;
      padding: 10px 12px;
      background: #0a0a0f;
      border: 1px solid #2a2a3a;
      border-radius: 8px;
      color: #e5e5e5;
      font-size: 14px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      outline: none;
      transition: border-color 0.15s;
    }
    input:focus {
      border-color: #10b981;
    }
    input::placeholder {
      color: #444;
    }
    button {
      width: 100%;
      padding: 12px;
      background: #10b981;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
      margin-top: 8px;
    }
    button:hover { background: #059669; }
    button:disabled {
      background: #333;
      cursor: not-allowed;
    }
    .error {
      background: #1a0a0a;
      border: 1px solid #ef4444;
      color: #ef4444;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 16px;
    }
    .success-card {
      text-align: center;
      padding: 48px 32px;
    }
    .success-card .check {
      width: 56px;
      height: 56px;
      background: #10b981;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 28px;
    }
    .success-card h2 {
      font-size: 18px;
      color: #fff;
      margin-bottom: 8px;
    }
    .success-card p {
      color: #888;
      font-size: 13px;
      line-height: 1.6;
    }
    .success-card code {
      display: block;
      background: #0a0a0f;
      border: 1px solid #1e1e2e;
      border-radius: 8px;
      padding: 12px;
      margin-top: 16px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 13px;
      color: #10b981;
    }
    .row {
      display: flex;
      gap: 12px;
    }
    .row .field { flex: 1; }
  </style>
</head>
<body>
  <div class="container">
    ${success ? `
    <div class="card success-card">
      <div class="check">&#10003;</div>
      <h2>Setup Complete</h2>
      <p>Your configuration has been saved. Start the full stack now:</p>
      <code>docker compose up -d --build</code>
      <p style="margin-top: 16px;">Then open <strong>http://your-server:3000</strong> to access the dashboard.</p>
    </div>
    ` : `
    <div class="card">
      <div class="logo">
        <h1>AI Remote Service</h1>
        <p>First-time setup — configure your deployment</p>
      </div>

      ${error ? `<div class="error">${error}</div>` : ""}

      <form method="POST" action="/setup" id="setupForm">
        <div class="section">
          <div class="section-title">Required</div>

          <div class="field">
            <label>Anthropic API Key <span class="required">*</span>
              <span class="hint">Get one at console.anthropic.com</span>
            </label>
            <input type="password" name="anthropic_api_key" placeholder="sk-ant-..." required />
          </div>

          <div class="field">
            <label>PostgreSQL Password <span class="required">*</span>
              <span class="hint">Password for the database (will be created automatically)</span>
            </label>
            <input type="text" name="postgres_password" placeholder="strong-random-password" required />
          </div>
        </div>

        <div class="section">
          <div class="section-title">Networking</div>

          <div class="field">
            <label>Server IP / Domain
              <span class="hint">Public address where agents will reach the API. Leave blank for localhost.</span>
            </label>
            <input type="text" name="server_address" placeholder="e.g. 192.168.1.100 or rmm.example.com" />
          </div>

          <div class="row">
            <div class="field">
              <label>Dashboard Port</label>
              <input type="number" name="web_port" value="3000" />
            </div>
            <div class="field">
              <label>API Port</label>
              <input type="number" name="api_port" value="8080" />
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Agent Binary</div>

          <div class="field">
            <label>GitHub Repo
              <span class="hint">For agent binary downloads (org/repo format). Optional — you can also distribute the binary manually.</span>
            </label>
            <input type="text" name="github_repo" placeholder="e.g. your-org/ai-rmm-docker" />
          </div>
        </div>

        <button type="submit">Save &amp; Complete Setup</button>
      </form>
    </div>
    `}
  </div>
</body>
</html>`;
}

function parseForm(body) {
  const params = new URLSearchParams(body);
  const obj = {};
  for (const [key, value] of params) {
    obj[key] = value.trim();
  }
  return obj;
}

function generateEnv(data) {
  const serverAddr = data.server_address || "localhost";
  const apiPort = data.api_port || "8080";
  const webPort = data.web_port || "3000";

  const lines = [
    `# Generated by AI Remote Service Setup`,
    `# ${new Date().toISOString()}`,
    ``,
    `# ─── Required ─────────────────────────────────────────────────────────`,
    `POSTGRES_PASSWORD=${data.postgres_password}`,
    `ANTHROPIC_API_KEY=${data.anthropic_api_key}`,
    ``,
    `# ─── Database ─────────────────────────────────────────────────────────`,
    `POSTGRES_DB=ai_remote_service`,
    `POSTGRES_USER=postgres`,
    `POSTGRES_PORT=5432`,
    ``,
    `# ─── Redis ────────────────────────────────────────────────────────────`,
    `REDIS_PORT=6379`,
    ``,
    `# ─── API ──────────────────────────────────────────────────────────────`,
    `API_PORT=${apiPort}`,
    `API_URL=http://${serverAddr}:${apiPort}`,
    `FRONTEND_URL=http://${serverAddr}:${webPort}`,
    `CORS_ORIGINS=http://${serverAddr}:${webPort}`,
  ];

  if (data.github_repo) {
    lines.push(`GITHUB_REPO=${data.github_repo}`);
  } else {
    lines.push(`GITHUB_REPO=`);
  }

  lines.push(
    ``,
    `# ─── Web ──────────────────────────────────────────────────────────────`,
    `WEB_PORT=${webPort}`,
    `VITE_API_URL=`,
    ``
  );

  return lines.join("\n");
}

const server = http.createServer((req, res) => {
  // Check if .env already exists with required values
  if (req.method === "GET" && req.url === "/") {
    if (fs.existsSync(ENV_PATH)) {
      const existing = fs.readFileSync(ENV_PATH, "utf8");
      if (existing.includes("ANTHROPIC_API_KEY=sk-") && existing.includes("POSTGRES_PASSWORD=")) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(getPage("", true));
        return;
      }
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(getPage());
    return;
  }

  if (req.method === "POST" && req.url === "/setup") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const data = parseForm(body);

      // Validate required fields
      if (!data.anthropic_api_key) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(getPage("Anthropic API Key is required."));
        return;
      }
      if (!data.postgres_password || data.postgres_password.length < 8) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(getPage("PostgreSQL password must be at least 8 characters."));
        return;
      }

      // Write .env
      try {
        const envDir = path.dirname(ENV_PATH);
        if (!fs.existsSync(envDir)) {
          fs.mkdirSync(envDir, { recursive: true });
        }
        fs.writeFileSync(ENV_PATH, generateEnv(data), { mode: 0o600 });
        console.log(`[setup] .env written to ${ENV_PATH}`);
      } catch (err) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(getPage(`Failed to write config: ${err.message}`));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(getPage("", true));
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`[setup] Setup wizard running at http://localhost:${PORT}`);
  console.log(`[setup] Will write .env to ${ENV_PATH}`);
});
