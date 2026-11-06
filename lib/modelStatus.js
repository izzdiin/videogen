import fs from "fs";
import path from "path";
import { DATA_DIR } from "./store.js";
import { listModelsRaw } from "./ai.js";

const CACHE_FILE = path.join(DATA_DIR, "model-status.json");
const STALE_MS = 15 * 60 * 1000;
let refreshing = null;

export function readStatusCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function probeModel(id) {
  const BASE = (process.env.NINEROUTER_BASE_URL || "http://192.168.11.11:20128/v1").replace(/\/$/, "");
  const KEY = process.env.NINEROUTER_API_KEY || "";
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}),
      },
      body: JSON.stringify({
        model: id,
        stream: false,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Reply with the word OK." },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function refreshModelStatus() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const models = await listModelsRaw();
    const results = {};
    const queue = [...models];
    async function worker() {
      while (queue.length) {
        const id = queue.shift();
        results[id] = await probeModel(id);
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    const cache = { checkedAt: new Date().toISOString(), results };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    return cache;
  })();
  try {
    return await refreshing;
  } finally {
    refreshing = null;
  }
}

export async function modelsWithStatus() {
  const models = await listModelsRaw();
  const cache = readStatusCache();
  const stale = !cache || Date.now() - new Date(cache.checkedAt).getTime() > STALE_MS;
  if (stale && !refreshing) {
    refreshModelStatus().catch(() => {});
  }
  return {
    models: models.map((id) => ({
      id,
      active: cache?.results ? (id in cache.results ? cache.results[id] : null) : null,
    })),
    checkedAt: cache?.checkedAt || null,
    probing: Boolean(refreshing) || stale,
  };
}
