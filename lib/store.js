import fs from "fs";
import path from "path";
import crypto from "crypto";
import { VISUAL_STYLE_IDS } from "./visualStyles.js";
import { audioFromPreset, sanitizeAudioConfig } from "./audioPresets.js";

const clampNum = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const PROJECTS_DIR = path.join(DATA_DIR, "projects");

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}
ensureDir(PROJECTS_DIR);

export function projectDir(id) {
  return path.join(PROJECTS_DIR, id);
}

export function newSceneId() {
  return "s" + crypto.randomBytes(4).toString("hex");
}

export function blankScene() {
  return {
    id: newSceneId(),
    title: "",
    narration: "",
    imagePrompt: "",
    overlay: "",
    durationHint: 6,
    image: { status: "none" },
    vo: { status: "none" },
    video: { status: "none" },
    sfx: { status: "none" },
    voVolume: 1,
    sfxVolume: 0.9,
    bgmVolume: null,
    visualChoice: "auto",
    stick: null,
    dc: null,
    dg: null,
    ed: null,
  };
}

import { defaultVoice } from "./voices.js";
export { VOICES, defaultVoice } from "./voices.js";

// Visual yang dipakai sebuah scene Slides saat rakit: klip Flow
// (scene.video) atau gambar latar (scene.image), mengikuti pilihan per
// scene. "auto" (bawaan) memakai video bila klipnya siap, selain itu
// gambar. Mengembalikan null bila visual terpilih belum siap — scene
// belum bisa dirakit.
export function resolveSceneVisual(scene) {
  const hasVideo = scene?.video?.status === "ready";
  const hasImage = scene?.image?.status === "ready";
  if (scene?.visualChoice === "video") return hasVideo ? "video" : null;
  if (scene?.visualChoice === "gambar") return hasImage ? "gambar" : null;
  return hasVideo ? "video" : hasImage ? "gambar" : null;
}

// Ringkasan rencana AI Director yang melahirkan proyek ini (bila ada).
// Konfigurasi mesinnya sendiri sudah dipetakan ke field proyek biasa;
// di sini hanya konteks strateginya yang disimpan: kategori, target
// audiens (dipakai penulis naskah untuk menyesuaikan nada), arahan
// musik, dan alasan — lihat lib/director.js.
function sanitizeDirector(d) {
  if (!d || typeof d !== "object") return null;
  const s = (v, n) => String(v ?? "").slice(0, n);
  return {
    kategori: s(d.kategori, 60),
    targetAudiens: ["anak", "remaja", "dewasa", "umum"].includes(d.targetAudiens)
      ? d.targetAudiens
      : "umum",
    musik: s(d.musik, 80),
    alasan: s(d.alasan, 400),
    model: s(d.modelDipakai || d.model, 120),
    dibuatPada: new Date().toISOString(),
  };
}

export function createProject(input) {
  const id = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14) +
    "-" + crypto.randomBytes(2).toString("hex");
  const audience = input.audience === "en" ? "en" : "id";
  const project = {
    id,
    title: input.title || "Proyek tanpa judul",
    theme: input.theme || "",
    audience,
    targetDuration: Number(input.targetDuration) || 55,
    sceneCount: Math.min(20, Math.max(2, Number(input.sceneCount) || 6)),
    style: input.style || "",
    engine: input.engine === "stickman" ? "stickman" : input.engine === "darkcard" ? "darkcard" : input.engine === "diagram" ? "diagram" : input.engine === "editorial" ? "editorial" : "slides",
    stickStyle: ["B1", "B2", "B3"].includes(input.stickStyle) ? input.stickStyle : "B1",
    visualStyle: VISUAL_STYLE_IDS.includes(input.visualStyle) ? input.visualStyle : "bebas",
    darkcard: {
      watermark: String(input.dcWatermark || "").slice(0, 80),
      accent: /^#[0-9a-fA-F]{6}$/.test(input.dcAccent || "") ? input.dcAccent : "#F26D8D",
    },
    diagram: {
      watermark: String(input.dgWatermark || "").slice(0, 80),
      accent: /^#[0-9a-fA-F]{6}$/.test(input.dgAccent || "") ? input.dgAccent : "#E4572E",
      theme: input.dgTheme === "dark" ? "dark" : "light",
      mode: input.dgMode === "bedah" ? "bedah" : "akumulasi",
    },
    editorial: {
      watermark: String(input.edWatermark || "").slice(0, 80),
      accent: /^#[0-9a-fA-F]{6}$/.test(input.edAccent || "") ? input.edAccent : "#E94F1E",
    },
    captionStyle: input.captionStyle === "satukata" ? "satukata" : "frasa",
    visualSource: "gambar",
    scriptTemplate: input.scriptTemplate === "andai" ? "andai" : "",
    director: sanitizeDirector(input.director),
    audio: sanitizeAudioConfig(input.audio, null) || audioFromPreset(input.audioPreset),
    poll: { question: "", options: [], voText: "", vo: { status: "none" } },
    aspect: ["9:16", "1:1", "16:9"].includes(input.aspect) ? input.aspect : "9:16",
    executors: {
      scriptModel: input.scriptModel || "",
      imageProvider: input.imageProvider || "pollinations",
      voProvider: input.voProvider || "edge-tts",
      voice: input.voice || defaultVoice(audience),
      assembly: input.assembly || "server",
    },
    scenes: [],
    renders: {},
    job: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  ensureDir(projectDir(id));
  ensureDir(path.join(projectDir(id), "stills"));
  ensureDir(path.join(projectDir(id), "vo"));
  ensureDir(path.join(projectDir(id), "clips"));
  ensureDir(path.join(projectDir(id), "audio"));
  ensureDir(path.join(projectDir(id), "sfx"));
  ensureDir(path.join(projectDir(id), "renders"));
  saveProject(project);
  return project;
}

export function projectJsonPath(id) {
  return path.join(projectDir(id), "project.json");
}

export function loadProject(id) {
  try {
    return JSON.parse(fs.readFileSync(projectJsonPath(id), "utf8"));
  } catch {
    return null;
  }
}

export function saveProject(project) {
  project.updatedAt = new Date().toISOString();
  const tmp = projectJsonPath(project.id) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(project, null, 2));
  fs.renameSync(tmp, projectJsonPath(project.id));
}

export function listProjects() {
  const out = [];
  for (const id of fs.readdirSync(PROJECTS_DIR)) {
    const p = loadProject(id);
    if (!p) continue;
    out.push({
      id: p.id,
      title: p.title,
      audience: p.audience,
      engine: p.engine || "slides",
      aspect: p.aspect || "9:16",
      sceneCount: p.scenes.length,
      hasFinal: Boolean(p.renders?.final?.status === "done"),
      updatedAt: p.updatedAt,
    });
  }
  return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function deleteProject(id) {
  fs.rmSync(projectDir(id), { recursive: true, force: true });
}

// Merge scenes submitted from the client into the stored project.
// Asset references (image/vo) are kept from the server copy, matched by scene id;
// edits to narration/imagePrompt mark the dependent asset as stale.
export function mergeScenes(project, incoming) {
  const oldById = new Map(project.scenes.map((s) => [s.id, s]));
  const merged = [];
  for (const inc of incoming) {
    const old = oldById.get(inc.id);
    const scene = {
      id: inc.id || newSceneId(),
      title: String(inc.title ?? ""),
      narration: String(inc.narration ?? ""),
      imagePrompt: String(inc.imagePrompt ?? ""),
      overlay: String(inc.overlay ?? ""),
      durationHint: Number(inc.durationHint) || 6,
      image: old ? old.image : { status: "none" },
      vo: old ? old.vo : { status: "none" },
      video: old ? old.video : { status: "none" },
      sfx: old ? old.sfx : { status: "none" },
      voVolume: clampNum(inc.voVolume, 0, 2, old ? old.voVolume ?? 1 : 1),
      sfxVolume: clampNum(inc.sfxVolume, 0, 2, old ? old.sfxVolume ?? 0.9 : 0.9),
      bgmVolume:
        inc.bgmVolume === undefined
          ? old
            ? old.bgmVolume ?? null
            : null
          : inc.bgmVolume === null || inc.bgmVolume === ""
            ? null
            : clampNum(inc.bgmVolume, 0, 1, null),
      visualChoice: ["video", "gambar"].includes(inc.visualChoice) ? inc.visualChoice : old ? old.visualChoice || "auto" : "auto",
      stick: inc.stick !== undefined ? inc.stick : old ? old.stick ?? null : null,
      dc: inc.dc !== undefined ? inc.dc : old ? old.dc ?? null : null,
      dg: inc.dg !== undefined ? inc.dg : old ? old.dg ?? null : null,
      ed: inc.ed !== undefined ? inc.ed : old ? old.ed ?? null : null,
    };
    if (old) {
      if (old.narration !== scene.narration && scene.vo.status === "ready") {
        scene.vo = { ...scene.vo, stale: true };
      }
      if (old.imagePrompt !== scene.imagePrompt && scene.image.status === "ready") {
        scene.image = { ...scene.image, stale: true };
      }
    }
    merged.push(scene);
  }
  // remove asset files of scenes that no longer exist
  const kept = new Set(merged.map((s) => s.id));
  for (const old of project.scenes) {
    if (!kept.has(old.id)) {
      for (const sub of ["stills", "vo"]) {
        const dir = path.join(projectDir(project.id), sub);
        for (const f of fs.readdirSync(dir)) {
          if (f.startsWith(old.id + ".")) fs.rmSync(path.join(dir, f), { force: true });
        }
      }
    }
  }
  project.scenes = merged;
  return project;
}
