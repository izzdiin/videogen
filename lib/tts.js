import { spawn } from "child_process";
import { aiConfig } from "./settings.js";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}: ${err.slice(-400)}`))));
  });
}

export function probeDuration(file) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", file,
    ]);
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("error", () => resolve(0));
    p.on("close", () => resolve(parseFloat(out) || 0));
  });
}

export async function synthesize(text, voice, destFile) {
  await run("edge-tts", ["--voice", voice, "--text", text, "--write-media", destFile]);
  const duration = await probeDuration(destFile);
  return { duration };
}

// Voice over by Muse itself, relayed through muse-bridge on stbjkt2
// (added 6 Nov 2026): the bridge queues the request as endpoint "audio",
// a Muse agent cycle synthesizes the narration with its built-in TTS and
// returns the MP3 bytes via the queue/done-aud file pipe. No 9Router quota
// involved; slow (agent wake + synthesis), so a single attempt with a long
// timeout — the pipeline can simply be re-run for missing scenes.
export async function synthesizeClaude(text, voice, destFile, language) {
  const fs = await import("fs");
  const http = await import("http");
  const { bridgeBase: base, bridgeKey: key } = aiConfig();
  if (!key) {
    throw new Error(
      "Kunci muse-bridge belum dipasang di server (MUSE_BRIDGE_KEY kosong). " +
      "Pasang dulu, atau pakai penyedia VO lain."
    );
  }
  // node:http, NOT fetch — same undici headersTimeout lesson as images.
  // The bridge waits up to 1500s for the worker's answer; the client waits a
  // little longer (1560s). On a timeout the request is retried (the bridge
  // deletes a timed-out request, so a retry starts clean), up to 2 retries:
  // a stalled worker host must not fail a scene for good.
  const payload = JSON.stringify({
    model: "muse-tts",
    input: text,
    voice: voice || "helio",
    language: language || "id",
  });
  const attemptOnce = () =>
    new Promise((resolve, reject) => {
      const u = new URL(`${base}/audio/speech`);
      const req = http.request(
        { hostname: u.hostname, port: u.port, path: u.pathname, method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`,
                     "Content-Length": Buffer.byteLength(payload) },
          timeout: 1560000 },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
        }
      );
      req.on("timeout", () => req.destroy(new Error("Bridge tidak menjawab dalam 1560 detik.")));
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let body = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res;
    try {
      res = await attemptOnce();
    } catch (e) {
      if (attempt < 3 && /tidak menjawab dalam/i.test(e.message || "")) {
        await sleep(5000);
        continue;
      }
      throw e;
    }
    if (res.status === 200) {
      body = res.body;
      break;
    }
    let msg = `HTTP ${res.status}`;
    try { msg = JSON.parse(res.body.toString("utf8"))?.error?.message || msg; } catch {}
    if (attempt < 3 && /did not answer in time/i.test(String(msg))) {
      await sleep(5000);
      continue;
    }
    throw new Error(`VO via Muse (bridge) gagal: ${String(msg).slice(0, 220)}`);
  }
  if (!body) throw new Error("VO via Muse (bridge) gagal setelah 3 percobaan.");
  if (body.length < 3000) throw new Error("Hasil VO via Muse (bridge) terlalu kecil, dianggap gagal.");
  fs.writeFileSync(destFile, body);
  const duration = await probeDuration(destFile);
  return { duration };
}

export async function synthesizeGemini(text, voice, destFile) {
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");
  const { ninerouterBase: BASE, ninerouterKey: KEY } = aiConfig();
  const primary = process.env.TTS_MODEL_GEMINI || "gemini/gemini-3.1-flash-tts-preview";
  const models = [...new Set([primary, "gemini/gemini-2.5-flash-preview-tts"])];
  let buf = null;
  let lastErr = "";
  for (const model of models) {
    const res = await fetch(`${BASE}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}),
      },
      body: JSON.stringify({ model, input: text, voice }),
      signal: AbortSignal.timeout(180000),
    });
    if (res.ok) {
      buf = Buffer.from(await res.arrayBuffer());
      if (buf.length >= 5000) break;
      lastErr = `hasil dari ${model} terlalu kecil`;
      buf = null;
      continue;
    }
    const t = await res.text().catch(() => "");
    lastErr = `${model} HTTP ${res.status}: ${t.slice(0, 160)}`;
  }
  if (!buf) throw new Error(`Gemini TTS gagal di semua model. Terakhir: ${lastErr}`);
  const tmp = path.join(os.tmpdir(), `vg-tts-${Date.now()}.wav`);
  fs.writeFileSync(tmp, buf);
  try {
    await run("ffmpeg", ["-y", "-v", "error", "-i", tmp, "-codec:a", "libmp3lame", "-q:a", "3", destFile]);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  const duration = await probeDuration(destFile);
  return { duration };
}
