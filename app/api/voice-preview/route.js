import fs from "fs";
import path from "path";
import { DATA_DIR } from "../../../lib/store.js";
import { VOICES, GEMINI_VOICES, MUSE_VOICES } from "../../../lib/voices.js";
import { synthesize, synthesizeGemini, synthesizeClaude } from "../../../lib/tts.js";

export const dynamic = "force-dynamic";

const SAMPLES = {
  id: "Halo, ini contoh suara narasi untuk video Anda. Dengan suara ini, cerita Anda akan terdengar jelas dan hidup.",
  en: "Hello, this is a sample narration voice for your video. With this voice, your story will sound clear and engaging.",
};

export async function GET(req) {
  const url = new URL(req.url);
  const voice = url.searchParams.get("voice") || "";
  const provider = url.searchParams.get("provider") || "edge-tts";
  const dir = path.join(DATA_DIR, "voice-previews");
  fs.mkdirSync(dir, { recursive: true });

  if (provider === "muse-bridge") {
    if (!MUSE_VOICES.some((v) => v.id === voice)) {
      return new Response("Suara tidak dikenal.", { status: 400 });
    }
    const file = path.join(dir, `Muse-${voice}.mp3`);
    if (!fs.existsSync(file)) {
      try {
        await synthesizeClaude(SAMPLES.id, voice, file, "id");
      } catch (e) {
        return new Response(`Gagal membuat contoh suara: ${e.message || e}`, { status: 502 });
      }
    }
    return new Response(fs.readFileSync(file), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" },
    });
  }

  if (provider === "gemini-tts") {
    if (!GEMINI_VOICES.some((v) => v.id === voice)) {
      return new Response("Suara tidak dikenal.", { status: 400 });
    }
    const file = path.join(dir, `gemini-${voice}.mp3`);
    if (!fs.existsSync(file)) {
      try {
        await synthesizeGemini(SAMPLES.id, voice, file);
      } catch (e) {
        return new Response(`Gagal membuat contoh suara: ${e.message || e}`, { status: 502 });
      }
    }
    return new Response(fs.readFileSync(file), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" },
    });
  }

  const all = [...VOICES.id, ...VOICES.en].map((v) => v.id);
  if (!all.includes(voice)) {
    return new Response("Suara tidak dikenal.", { status: 400 });
  }
  const lang = voice.startsWith("id-") ? "id" : "en";
  const file = path.join(dir, `${voice}.mp3`);
  if (!fs.existsSync(file)) {
    try {
      await synthesize(SAMPLES[lang], voice, file);
    } catch (e) {
      return new Response(`Gagal membuat contoh suara: ${e.message || e}`, { status: 502 });
    }
  }
  return new Response(fs.readFileSync(file), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" },
  });
}
