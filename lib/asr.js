// ASR kata-paksa via Gemini di 9Router (Fase D).
//
// BUKAN transkripsi bebas: teks yang diucapkan DIKETAHUI (narasi
// scene berasal dari VO yang dibuat dari teks itu), jadi model
// hanya diminta memberi timestamp tiap kata dari teks yang
// diberikan. Uji mentah 10 Nov pada VO Gemini berbahasa Indonesia
// (7,6 dtk, 15 kata): model flash besar menolak audio inline
// (402), gemini-3.5-flash-lite menjawab dalam ±2–4 menit dan kata-
// katanya persis teks, monoton naik. Kelemahan terukur: skala
// waktunya meregang melewati durasi audio asli (kata terakhir
// selesai 9,15 pada audio 7,74 dtk) — karena itu timestamp mentah
// TIDAK dipakai apa adanya: normalizeWordTimings menormalkan
// rentang kata pertama..terakhir ke jendela bicara renderer
// [0.35, dur-0.15] dengan skala linear, menjaga urutan & proporsi
// jeda antar kata dari ASR sementara awal/akhir absolut dikunci ke
// durasi VO yang sebenarnya. Bila model gagal semua, pemanggil
// jatuh ke estimasi karakter (captions.wordTimings) dan UI
// menandainya "perkiraan".
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";
import { aiConfig } from "./settings.js";

const execFileP = promisify(execFile);

export const ASR_MODELS = [
  "gemini/gemini-3.5-flash-lite",
  "gemini/gemini-3.1-flash-lite-preview",
];

const wordsOf = (text) =>
  String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);

// Validasi hasil model: jumlah kata HARUS sama dengan narasi dan
// urutan katanya cocok (dibandingkan tanpa tanda baca & kapital).
// Mengembalikan [{w, a, b}] dengan kata ASLI dari narasi, atau null
// bila hasil model tidak bisa dipercaya.
export function alignAsrWords(rawItems, narration) {
  const canon = (w) => String(w).toLowerCase().replace(/[^a-zà-ÿ0-9]/g, "");
  const words = wordsOf(narration);
  if (!Array.isArray(rawItems) || rawItems.length !== words.length || !words.length) return null;
  const out = [];
  let prevEnd = 0;
  for (let k = 0; k < words.length; k++) {
    const it = rawItems[k] || {};
    if (canon(it.w) !== canon(words[k])) return null;
    let a = Number(it.start);
    let b = Number(it.end);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    a = Math.max(prevEnd, Math.min(a, b));
    b = Math.max(a + 0.05, b);
    out.push({ w: words[k], a, b });
    prevEnd = b;
  }
  return out;
}

// Skala linear rentang [first.start, last.end] -> [winStart, winEnd].
export function normalizeWordTimings(items, winStart, winEnd) {
  if (!items?.length || winEnd <= winStart) return items || [];
  const first = items[0].a;
  const last = items[items.length - 1].b;
  const span = Math.max(0.1, last - first);
  const target = winEnd - winStart;
  const map = (t) => winStart + ((t - first) / span) * target;
  return items.map((it, k) => ({
    w: it.w,
    a: k === 0 ? winStart : map(it.a),
    b: k === items.length - 1 ? winEnd : Math.max(map(it.a) + 0.05, map(it.b)),
  }));
}

function extractJsonArray(text) {
  const t = String(text || "");
  const a = t.indexOf("[");
  const b = t.lastIndexOf("]");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
}

async function chatAudio(model, narration, b64) {
  const { ninerouterBase: BASE, ninerouterKey: KEY } = aiConfig();
  const prompt =
    `Berikut teks persis yang diucapkan dalam audio ini:\n"${narration}"\n` +
    "Beri timestamp untuk SETIAP kata dari teks itu sesuai urutan ucapannya. " +
    "Jangan mengubah, menambah, atau membuang kata. Keluarkan HANYA JSON array: " +
    '[{"w":"kata","start":0.00,"end":0.00}, ...] dalam detik, dua desimal.';
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}),
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "input_audio", input_audio: { data: b64, format: "mp3" } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(240000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`ASR ${model} HTTP ${res.status}: ${t.slice(0, 160)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

// Transkripsikan VO satu scene. voAbs = berkas VO di disk. Audio
// dikecilkan dulu ke mp3 16 kHz mono (payload inline kecil).
// Mengembalikan {items:[{w,a,b}], model} — melempar bila semua
// model gagal / hasil tidak selaras dengan narasi.
export async function transcribeSceneWords(voAbs, narration) {
  const tmp = path.join(os.tmpdir(), `vg-asr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`);
  try {
    await execFileP("ffmpeg", ["-y", "-v", "error", "-i", voAbs, "-ar", "16000", "-ac", "1", tmp], { timeout: 120000 });
    const b64 = fs.readFileSync(tmp).toString("base64");
    let lastErr = "";
    for (const model of ASR_MODELS) {
      try {
        const content = await chatAudio(model, narration, b64);
        const raw = extractJsonArray(content);
        const aligned = alignAsrWords(raw, narration);
        if (aligned) return { items: aligned, model };
        lastErr = `${model}: hasil tidak selaras dengan narasi`;
      } catch (e) {
        lastErr = String(e?.message || e);
      }
    }
    throw new Error(`ASR gagal di semua model. Terakhir: ${lastErr}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
