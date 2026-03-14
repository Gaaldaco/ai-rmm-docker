import { Router } from "express";
import { isConfigured, setSetting, getAllSettings } from "../lib/settings.js";
import { resetClient } from "../lib/claude.js";

const router = Router();

// Check if the system is configured
router.get("/status", async (_req, res) => {
  try {
    const configured = await isConfigured();
    const settings = configured ? await getAllSettings() : {};
    res.json({
      configured,
      // Only expose non-sensitive settings
      serverAddress: settings["SERVER_ADDRESS"] || "",
      githubRepo: settings["GITHUB_REPO"] || process.env.GITHUB_REPO || "",
    });
  } catch (err) {
    // If DB isn't ready yet, we're definitely not configured
    res.json({ configured: false });
  }
});

// Save setup configuration
router.post("/", async (req, res) => {
  try {
    const { anthropicApiKey, serverAddress, githubRepo } = req.body;

    if (!anthropicApiKey) {
      res.status(400).json({ error: "Anthropic API Key is required" });
      return;
    }

    await setSetting("ANTHROPIC_API_KEY", anthropicApiKey);

    if (serverAddress) {
      await setSetting("SERVER_ADDRESS", serverAddress);
    }
    if (githubRepo !== undefined) {
      await setSetting("GITHUB_REPO", githubRepo);
    }

    // Reset the Claude client so it picks up the new key
    resetClient();

    res.json({ success: true, message: "Configuration saved" });
  } catch (err: any) {
    console.error("[setup] Failed to save settings:", err);
    res.status(500).json({ error: "Failed to save configuration: " + err.message });
  }
});

export default router;
