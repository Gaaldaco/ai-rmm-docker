import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { createHash } from "crypto";
import { db } from "../db/index.js";
import { agents, machineSnapshots, remediationLog, knowledgeBase, alerts } from "../db/schema.js";
import { eq, and, isNull } from "drizzle-orm";
import { snapshotQueue } from "../lib/queue.js";
import { setRedis, redis } from "../lib/redis.js";
import { createClient } from "redis";
import { broadcast } from "../index.js";

// ─── Connected agents map ──────────────────────────────────────────────────
const agentConnections = new Map<string, WebSocket>();

export function isAgentConnected(agentId: string): boolean {
  const ws = agentConnections.get(agentId);
  return !!ws && ws.readyState === WebSocket.OPEN;
}

export function pushCommandToAgent(agentId: string, command: { id: string; command: string }): boolean {
  const ws = agentConnections.get(agentId);
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;

  ws.send(JSON.stringify({ type: "command", data: command }));
  return true;
}

export function getConnectedAgentIds(): string[] {
  return Array.from(agentConnections.keys());
}

// ─── Setup ─────────────────────────────────────────────────────────────────
export function setupAgentWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws/agent" });

  wss.on("connection", async (ws, req) => {
    // ── Authenticate via Authorization header ──
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      ws.send(JSON.stringify({ type: "error", data: { error: "Missing Authorization header" } }));
      ws.close();
      return;
    }

    const apiKey = authHeader.slice(7);
    const keyHash = createHash("sha256").update(apiKey).digest("hex");

    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.apiKeyHash, keyHash))
      .limit(1);

    if (!agent) {
      ws.send(JSON.stringify({ type: "error", data: { error: "Invalid API key" } }));
      ws.close();
      return;
    }

    // ── Register connection ──
    agentConnections.set(agent.id, ws);
    console.log(`[ws/agent] ${agent.name} (${agent.id}) connected`);

    try {
      // Update agent status
      await db.update(agents)
        .set({ status: "online", lastSeen: new Date(), updatedAt: new Date() })
        .where(eq(agents.id, agent.id));
      await setRedis(`heartbeat:${agent.id}`, { lastSeen: Date.now() }, 90);

      // Send any pending commands the agent missed while disconnected
      const pendingCmds = await db.select()
        .from(remediationLog)
        .where(and(eq(remediationLog.agentId, agent.id), isNull(remediationLog.success)))
        .limit(20);

      for (const cmd of pendingCmds) {
        ws.send(JSON.stringify({ type: "command", data: { id: cmd.id, command: cmd.command } }));
      }
    } catch (err) {
      console.error(`[ws/agent] Post-auth error for ${agent.name}:`, err);
    }

    // ── Keepalive ping every 30s ──
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);

    // ── Handle incoming messages ──
    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case "snapshot":
            await handleSnapshot(agent.id, agent, msg.data);
            ws.send(JSON.stringify({ type: "snapshot_ack" }));
            break;

          case "heartbeat":
            await db.update(agents)
              .set({ status: "online", lastSeen: new Date(), updatedAt: new Date() })
              .where(eq(agents.id, agent.id));
            await setRedis(`heartbeat:${agent.id}`, { lastSeen: Date.now() }, 90);
            ws.send(JSON.stringify({ type: "heartbeat_ack" }));
            break;

          case "command_result":
            await handleCommandResult(msg.data);
            break;

          default:
            console.log(`[ws/agent] Unknown message type from ${agent.name}: ${msg.type}`);
        }
      } catch (err) {
        console.error(`[ws/agent] Message error from ${agent.name}:`, err);
      }
    });

    // ── Cleanup on disconnect ──
    ws.on("close", () => {
      agentConnections.delete(agent.id);
      clearInterval(pingInterval);
      console.log(`[ws/agent] ${agent.name} (${agent.id}) disconnected`);
    });

    ws.on("error", (err) => {
      console.error(`[ws/agent] Error from ${agent.name}:`, err);
    });
  });

  // Subscribe to Redis for commands from the worker
  subscribeToCommandChannel();

  console.log("[ws/agent] Agent WebSocket server ready at /ws/agent");
  return wss;
}

// ─── Snapshot handling (same logic as POST /api/snapshots) ──────────────────
async function handleSnapshot(agentId: string, agent: any, data: any) {
  const [snapshot] = await db
    .insert(machineSnapshots)
    .values({
      agentId,
      cpu: data.cpu,
      memory: data.memory,
      disk: data.disk,
      network: data.network ?? [],
      processes: data.processes,
      openPorts: data.openPorts ?? [],
      users: data.users ?? [],
      authLogs: data.authLogs ?? [],
      pendingUpdates: data.pendingUpdates ?? [],
      services: data.services,
    })
    .returning();

  // Update agent info
  await db.update(agents)
    .set({
      status: "online",
      lastSeen: new Date(),
      hostname: data.hostname,
      os: data.os,
      arch: data.arch,
      platform: data.platform,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId));

  await setRedis(`heartbeat:${agentId}`, { lastSeen: Date.now() }, 90);

  // Queue for AI analysis
  await snapshotQueue.add("analyze", {
    snapshotId: snapshot.id,
    agentId,
  });
}

// ─── Command result handling (same logic as POST /api/remediation/:id/result)
async function handleCommandResult(data: { id: string; output: string; exitCode: number; success: boolean }) {
  const [updated] = await db
    .update(remediationLog)
    .set({
      result: data.output,
      success: data.success,
      executedAt: new Date(),
    })
    .where(eq(remediationLog.id, data.id))
    .returning();

  if (!updated) return;

  // Update KB success/failure counts
  if (updated.kbEntryId) {
    const [kb] = await db.select({ s: knowledgeBase.successCount, f: knowledgeBase.failureCount })
      .from(knowledgeBase).where(eq(knowledgeBase.id, updated.kbEntryId));
    if (kb) {
      await db.update(knowledgeBase).set({
        successCount: data.success ? kb.s + 1 : kb.s,
        failureCount: data.success ? kb.f : kb.f + 1,
        updatedAt: new Date(),
      }).where(eq(knowledgeBase.id, updated.kbEntryId));
    }
  }

  // Resolve alert if remediation succeeded
  if (data.success && updated.alertId) {
    await db.update(alerts).set({
      resolved: true,
      resolvedAt: new Date(),
      resolvedBy: "auto",
    }).where(eq(alerts.id, updated.alertId));
  }

  // Broadcast result to frontend dashboard
  broadcast("remediation_result", {
    agentId: updated.agentId,
    remediationId: updated.id,
    success: data.success,
    output: data.output,
  });
}

// ─── Redis pub/sub: worker publishes commands, API relays to agents ─────────
async function subscribeToCommandChannel() {
  try {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const subscriber = createClient({ url: redisUrl });
    await subscriber.connect();

    await subscriber.subscribe("agent:command", (message) => {
      try {
        const { agentId, commandId, command } = JSON.parse(message);
        const pushed = pushCommandToAgent(agentId, { id: commandId, command });
        if (!pushed) {
          console.log(`[ws/agent] Agent ${agentId} not connected for command ${commandId}`);
        }
      } catch (err) {
        console.error("[ws/agent] Command relay error:", err);
      }
    });

    console.log("[ws/agent] Subscribed to Redis command channel");
  } catch (err) {
    console.error("[ws/agent] Failed to subscribe to Redis:", err);
  }
}
