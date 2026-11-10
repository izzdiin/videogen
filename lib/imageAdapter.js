// Image Generation Adapter — Character Consistency Engine fase CC2
// (keputusan user RD1–RD6, 10 Nov 2026; rencana di
// PLAN-character-consistency-engine.md).
//
// SATU pintu untuk semua pembuatan gambar yang dulu tersebar sebagai
// cabang if/else provider di pipeline, route gambar scene, route
// karakter/references, dan stickman. Kontraknya:
//
//   generateWithAdapter({ project, scene, prompt, destFile,
//                         providerOverride, onRetry })
//     -> { provider, mode, refsUsed: [kind], conditioning, seed? }
//
// MODE conditioning (dipisah tegas — koreksi atas diagram awal):
// - "multi"  : reference-conditioning sejati, >=2 referensi dikirim
//              sebagai gambar masukan (Workers AI FLUX.2 multipart).
// - "img2img": referensi utama menjadi titik awal difusi (SDXL via
//              9Router, image_b64 + strength). Menjaga identitas TAPI
//              ikut mengunci pose/komposisi referensi.
// - "text"   : fallback teks murni (perilaku v1 persis: prompt + blok
//              karakter yang sudah disisipkan pemanggil).
//
// Hasil conditioning DICATAT apa adanya supaya fallback tidak pernah
// menyamar sebagai conditioning. Bila jalur berkondisi GAGAL, adapter
// jatuh ke teks untuk provider yang sama dan mencatat "degraded" —
// gambar tetap jadi, kejujuran tetap utuh.
//
// CATATAN KETERSEDIAAN (terverifikasi 10 Nov 2026):
// - SDXL img2img via 9Router BEKERJA (uji warna membuktikan strength
//   benar-benar menahan keluaran ke gambar referensi).
// - Workers AI: token CF tersimpan saat ini DITOLAK Cloudflare (401
//   Authentication error) bahkan untuk teks biasa — jalur multi akan
//   menjawab error jujur itu sampai user mengganti token di Pengaturan.
// - Pollinations TIDAK diberi jalur referensi (RD3).
// - Venice & muse-bridge: teks saja di CC2 (jalur edit Venice adalah
//   pekerjaan terpisah di luar keputusan RD).

import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  generateImage,
  generateImageWorkersAI,
  generateImageVia9Router,
  generateImageViaBridge,
  generateImageViaVenice,
} from "./ai.js";
import { projectDir } from "./store.js";
import { resolveReferences } from "./characterReferences.js";

const execFileP = promisify(execFile);

export const IMAGE_PROVIDERS = ["pollinations", "sdxl-9router", "workers-ai", "muse-bridge", "venice", "upload"];

export const ADAPTER_CAPABILITIES = {
  "workers-ai": ["multi", "text"],
  "sdxl-9router": ["img2img", "text"],
  pollinations: ["text"],
  "muse-bridge": ["text"],
  venice: ["text"],
  upload: [],
};

// Kekuatan img2img bawaan: 0.75 membebaskan pose/latar sambil menahan
// fitur wajah & pakaian dari portrait.
export const IMG2IMG_STRENGTH = 0.75;

// Gabungkan resolusi semua karakter di scene menjadi satu rencana:
// mode terbaik yang tersedia dari aset, daftar berkas referensi
// (urut: portrait karakter pertama dulu — itulah primaryRef img2img),
// dan seed karakter pertama yang punya seed (jalur Pollinations).
function planFor(project, scene) {
  const resolved = scene ? resolveReferences(project, scene) : [];
  const refs = [];
  let seed = null;
  for (const r of resolved) {
    if (seed === null && Number.isFinite(r.seed)) seed = r.seed;
    for (const ref of r.refs) {
      if (!refs.some((x) => x.file === ref.file)) refs.push({ ...ref, characterId: r.characterId });
    }
  }
  const best = resolved.some((r) => r.mode === "multi")
    ? "multi"
    : resolved.some((r) => r.mode === "single")
      ? "single"
      : "text";
  return { resolved, refs, seed, best };
}

function pickMode(provider, best) {
  const caps = ADAPTER_CAPABILITIES[provider] || ["text"];
  if (best === "multi" && caps.includes("multi")) return "multi";
  if (best !== "text" && caps.includes("img2img")) return "img2img";
  return "text";
}

// Baca berkas referensi sebagai Buffer; untuk jalur multi, skalakan
// ke <=512px memakai ffmpeg (syarat FLUX.2). Mengembalikan null bila
// berkas hilang — pemanggil memperlakukannya sebagai referensi absen.
async function readRefBuffer(project, ref, scale) {
  const abs = path.join(projectDir(project.id), ref.file);
  if (!fs.existsSync(abs)) return null;
  const buf = fs.readFileSync(abs);
  if (!scale) return buf;
  const tmp = `${abs}.ref512.png`;
  try {
    await execFileP(
      "ffmpeg",
      ["-y", "-v", "error", "-i", abs, "-vf", "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease", tmp],
      { timeout: 60000 }
    );
    return fs.readFileSync(tmp);
  } catch {
    return buf;
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch {}
  }
}

// Prompt untuk mode berkondisi: rujukan eksplisit ke gambar masukan
// supaya model tahu gambar mana yang menjadi jangkar identitas.
function conditionedPrompt(basePrompt, mode, refs) {
  if (mode === "multi") {
    return (
      `${basePrompt}\nCharacter identity references: the provided input images show the SAME character(s) — ` +
      `image 1 is the primary identity reference. Keep the face, hair and signature outfit of the character(s) ` +
      `from the reference images EXACTLY; only pose, expression, activity and background follow this prompt.`
    );
  }
  if (mode === "img2img") {
    void refs;
    return (
      `${basePrompt}\nKeep the character's face, hair and signature outfit from the reference image; ` +
      `pose, expression, activity and background follow this prompt.`
    );
  }
  return basePrompt;
}

export async function generateWithAdapter({ project, scene = null, prompt, destFile, providerOverride = null, onRetry = null, aspect = null }) {
  const provider = providerOverride || project?.executors?.imageProvider || "pollinations";
  // Aspect efektif: pemanggil boleh memaksa (mis. layer selalu 1:1);
  // selebihnya rasio proyek. project di sini tidak diubah — salinan
  // dangkal hanya untuk pembacaan ukuran di fungsi provider.
  const effProject = aspect && project ? { ...project, aspect } : project;
  if (provider === "upload") {
    throw new Error("Penyedia gambar proyek ini 'unggah manual' — unggah berkas gambar secara manual.");
  }
  if (!IMAGE_PROVIDERS.includes(provider)) {
    throw new Error(`Penyedia gambar tidak dikenal: ${provider}`);
  }
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  const plan = planFor(effProject, scene);
  let mode = pickMode(provider, plan.best);
  const usedRefs = mode === "text" ? [] : plan.refs;
  const finalPrompt = conditionedPrompt(prompt, mode, usedRefs);
  const conditioning = {
    requested: plan.best,
    mode,
    provider,
    refs: usedRefs.map((r) => r.kind),
  };
  try {
    if (mode === "multi") {
      const bufs = [];
      for (const ref of usedRefs.slice(0, 4)) {
        const b = await readRefBuffer(effProject, ref, true);
        if (b) bufs.push(b);
      }
      if (bufs.length < 2) throw new Error("Berkas referensi untuk conditioning multi tidak lengkap di disk.");
      conditioning.refs = usedRefs.slice(0, bufs.length).map((r) => r.kind);
      await generateImageWorkersAI(finalPrompt, destFile, { refImages: bufs });
      return { provider, mode, refsUsed: conditioning.refs, conditioning };
    }
    if (mode === "img2img") {
      const primary = usedRefs[0];
      const buf = primary ? await readRefBuffer(effProject, primary, false) : null;
      if (!buf) throw new Error("Berkas referensi utama tidak ditemukan di disk.");
      await generateImageVia9Router(finalPrompt, destFile, effProject.aspect, {
        refImageB64: buf.toString("base64"),
        strength: IMG2IMG_STRENGTH,
      });
      conditioning.strength = IMG2IMG_STRENGTH;
      return { provider, mode, refsUsed: [primary.kind], conditioning: { ...conditioning, refs: [primary.kind] } };
    }
  } catch (e) {
    // Jalur berkondisi gagal: jatuh ke teks pada provider yang sama,
    // tercatat sebagai degraded. Untuk workers-ai TIDAK ada degradasi —
    // error-nya (token ditolak) juga menimpa jalur teks, jadi lempar
    // apa adanya supaya pesannya jujur sampai ke user.
    if (provider === "workers-ai") throw e;
    conditioning.degraded = String(e.message || e).slice(0, 200);
    mode = "text";
    conditioning.mode = "text";
  }
  // --- Jalur teks (perilaku v1, sama seperti sebelum adapter ada) ---
  if (provider === "sdxl-9router") {
    await generateImageVia9Router(prompt, destFile, effProject.aspect);
  } else if (provider === "muse-bridge") {
    await generateImageViaBridge(prompt, destFile, effProject.aspect);
  } else if (provider === "venice") {
    await generateImageViaVenice(prompt, destFile, effProject.aspect);
  } else if (provider === "workers-ai") {
    await generateImageWorkersAI(prompt, destFile);
  } else {
    const seed = plan.seed !== null ? plan.seed : Math.floor(Math.random() * 1000000);
    await generateImage(prompt, destFile, seed, onRetry || undefined, effProject.aspect);
    return { provider, mode: "text", refsUsed: [], conditioning, seed };
  }
  return { provider, mode, refsUsed: [], conditioning };
}
