import fs from "fs";
import path from "path";
import { DATA_DIR } from "./store.js";

// Runtime AI provider settings, editable from the Pengaturan tab and stored
// in data/settings.json (host volume, never in the repo). Every value falls
// back to the matching environment variable, then to the built-in default,
// so a fresh install behaves exactly like the env-only setup. The file is
// re-read whenever it changes, so saves apply without a restart.
const FILE = path.join(DATA_DIR, "settings.json");
let cache = { mtimeMs: -1, data: {} };

export function readSettings() {
  try {
    const st = fs.statSync(FILE);
    if (st.mtimeMs !== cache.mtimeMs) {
      cache = { mtimeMs: st.mtimeMs, data: JSON.parse(fs.readFileSync(FILE, "utf8")) || {} };
    }
  } catch {
    cache = { mtimeMs: -1, data: {} };
  }
  return cache.data;
}

export function saveSettings(patch) {
  const next = { ...readSettings() };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === undefined) continue;
    if (v === "") delete next[k];
    else next[k] = v;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  cache = { mtimeMs: -1, data: {} };
  // A new endpoint invalidates previously probed script-model statuses.
  try {
    fs.rmSync(path.join(DATA_DIR, "model-status.json"), { force: true });
  } catch {}
  return next;
}

const stripSlash = (u) => String(u || "").replace(/\/$/, "");

export function aiConfig() {
  const s = readSettings();
  return {
    ninerouterBase: stripSlash(
      s.ninerouterBase || process.env.NINEROUTER_BASE_URL || "http://192.168.11.11:20128/v1"
    ),
    ninerouterKey: s.ninerouterKey || process.env.NINEROUTER_API_KEY || "",
    bridgeBase: stripSlash(
      s.bridgeBase || process.env.MUSE_BRIDGE_BASE_URL || "http://192.168.11.11:8765/v1"
    ),
    bridgeKey: s.bridgeKey || process.env.MUSE_BRIDGE_KEY || "",
    cfAccountId:
      s.cfAccountId || process.env.CF_ACCOUNT_ID || "b0ce11cc6927f6af77eee206f5416eac",
    cfToken: s.cfToken || process.env.CF_AI_TOKEN || "",
    elevenlabsKey: s.elevenlabsKey || process.env.ELEVENLABS_API_KEY || "",
  };
}

// What the settings API may show: URLs and ids in full, keys only as booleans.
export function settingsView() {
  const c = aiConfig();
  return {
    ninerouterBase: c.ninerouterBase,
    ninerouterKeySet: Boolean(c.ninerouterKey),
    bridgeBase: c.bridgeBase,
    bridgeKeySet: Boolean(c.bridgeKey),
    cfAccountId: c.cfAccountId,
    cfTokenSet: Boolean(c.cfToken),
    elevenlabsKeySet: Boolean(c.elevenlabsKey),
  };
}
