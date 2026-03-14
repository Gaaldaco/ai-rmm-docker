import { db } from "../db/index.js";
import { settings } from "../db/schema.js";
import { eq } from "drizzle-orm";

// In-memory cache so we don't hit the DB on every AI call
const cache = new Map<string, string>();

export async function getSetting(key: string): Promise<string | null> {
  // Env var always takes priority
  const envKey = key.toUpperCase();
  if (process.env[envKey]) return process.env[envKey]!;

  // Check cache
  if (cache.has(key)) return cache.get(key)!;

  // Check DB
  try {
    const row = await db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);
    if (row.length > 0) {
      cache.set(key, row[0].value);
      return row[0].value;
    }
  } catch {
    // Table might not exist yet during migration
  }
  return null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  cache.set(key, value);
}

export async function getAllSettings(): Promise<Record<string, string>> {
  try {
    const rows = await db.select().from(settings);
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
      cache.set(row.key, row.value);
    }
    return result;
  } catch {
    return {};
  }
}

export async function isConfigured(): Promise<boolean> {
  const apiKey = await getSetting("ANTHROPIC_API_KEY");
  return !!apiKey;
}

export function clearCache() {
  cache.clear();
}
