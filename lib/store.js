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

// --- Layout proyek v2 (Fase E, butir 6) ---
// Struktur di dalam folder proyek:
//   project.json          manifest + konfigurasi (TANPA daftar scene)
//   script.json           keluaran mentah generator terakhir (provenans)
//   storyboard.json       storyboard terstruktur (Fase A; bila ada)
//   scenes/scene-NNN.json satu berkas per scene, urutan = nama berkas
//   assets/images/        gambar latar per scene (+ referensi hero)
//   assets/videos/        klip video Flow per scene
//   assets/audio/         VO scene (vo-<sid>), VO polling (poll), SFX (sfx-<sid>)
//   assets/characters/    gambar referensi karakter (Fase A)
//   assets/music/         musik latar (bgm)
//   previews/             render draf + folder kerja render (.work-*)
//   exports/              render final + commands.txt
// Semua field .file di proyek menyimpan path relatif terhadap folder
// proyek, jadi berkas layout lama (stills/, vo/, clips/, audio/, sfx/,
// renders/) tetap terbaca; migrasinya dilakukan migrateProjectLayout().
export const imageRel = (sceneId) => `assets/images/${sceneId}.jpg`;
export const sceneVoRel = (sceneId) => `assets/audio/vo-${sceneId}.mp3`;
export const POLL_VO_REL = "assets/audio/poll.mp3";
export const renderRel = (kind) => (kind === "final" ? "exports/final.mp4" : "previews/draft.mp4");

const PROJECT_SUBDIRS = [
  "scenes",
  "assets/images",
  "assets/videos",
  "assets/audio",
  "assets/characters",
  "assets/music",
  "previews",
  "exports",
];

export function ensureProjectDirs(id) {
  ensureDir(projectDir(id));
  for (const sub of PROJECT_SUBDIRS) ensureDir(path.join(projectDir(id), sub));
}

// Hapus semua berkas berawalan prefix di sebuah subfolder proyek
// (dipakai membersihkan slot aset sebelum ditulis ulang).
export function sweepAssetDir(id, sub, prefix) {
  const dir = path.join(projectDir(id), sub);
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith(prefix)) fs.rmSync(path.join(dir, f), { force: true });
    }
  } catch {}
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
  ensureProjectDirs(id);
  saveProject(project);
  return project;
}

export function projectJsonPath(id) {
  return path.join(projectDir(id), "project.json");
}

function writeJsonAtomic(abs, obj) {
  const tmp = abs + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, abs);
}

const sceneFileName = (i) => `scene-${String(i + 1).padStart(3, "0")}.json`;

// Baca daftar scene dari scenes/*.json (layout v2). Mengembalikan null
// bila folder scenes belum berisi berkas scene (proyek layout lama).
function loadScenesSplit(id) {
  const dir = path.join(projectDir(id), "scenes");
  let names;
  try {
    names = fs.readdirSync(dir).filter((f) => /^scene-\d+\.json$/.test(f)).sort();
  } catch {
    return null;
  }
  if (!names.length) return null;
  const scenes = [];
  for (const name of names) {
    try {
      scenes.push(JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
    } catch {
      return null;
    }
  }
  return scenes;
}

export function loadProject(id) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(projectJsonPath(id), "utf8"));
  } catch {
    return null;
  }
  const split = loadScenesSplit(id);
  if (split) manifest.scenes = split;
  else if (!Array.isArray(manifest.scenes)) manifest.scenes = [];
  // Artefak pendamping (script.json / storyboard.json) dibaca bila ada.
  for (const key of ["script", "storyboard"]) {
    if (manifest[key] === undefined) {
      try {
        manifest[key] = JSON.parse(fs.readFileSync(path.join(projectDir(id), `${key}.json`), "utf8"));
      } catch {}
    }
  }
  return manifest;
}

export function saveProject(project) {
  project.updatedAt = new Date().toISOString();
  ensureProjectDirs(project.id);
  const dir = projectDir(project.id);
  const scenes = Array.isArray(project.scenes) ? project.scenes : [];
  // Scene ditulis sebagai berkas terpisah; manifest tidak lagi memuatnya.
  const wanted = new Set();
  scenes.forEach((scene, i) => {
    const name = sceneFileName(i);
    wanted.add(name);
    writeJsonAtomic(path.join(dir, "scenes", name), scene);
  });
  try {
    for (const f of fs.readdirSync(path.join(dir, "scenes"))) {
      if (/^scene-\d+\.json$/.test(f) && !wanted.has(f)) {
        fs.rmSync(path.join(dir, "scenes", f), { force: true });
      }
    }
  } catch {}
  // Artefak pendamping: ditulis/dihapus mengikuti keberadaan datanya.
  for (const key of ["script", "storyboard"]) {
    const abs = path.join(dir, `${key}.json`);
    if (project[key] && typeof project[key] === "object") writeJsonAtomic(abs, project[key]);
    else if (project[key] === null) fs.rmSync(abs, { force: true });
  }
  const { scenes: _omit, script: _s, storyboard: _b, ...manifest } = project;
  manifest.layoutVersion = 2;
  writeJsonAtomic(projectJsonPath(project.id), manifest);
}

// Petakan path relatif layout lama ke layout v2; path yang sudah v2
// (atau tidak dikenal) dikembalikan apa adanya.
export function rewriteLegacyRel(rel) {
  if (!rel || typeof rel !== "string") return rel;
  let m;
  if ((m = rel.match(/^stills\/(.+)$/))) return `assets/images/${m[1]}`;
  if ((m = rel.match(/^clips\/(.+)$/))) return `assets/videos/${m[1]}`;
  if ((m = rel.match(/^vo\/poll(\..+)$/))) return `assets/audio/poll${m[1]}`;
  if ((m = rel.match(/^vo\/(.+)$/))) return `assets/audio/vo-${m[1]}`;
  if ((m = rel.match(/^sfx\/(.+)$/))) return `assets/audio/sfx-${m[1]}`;
  if ((m = rel.match(/^audio\/(.+)$/))) return `assets/music/${m[1]}`;
  if (rel === "renders/draft.mp4") return "previews/draft.mp4";
  if (rel === "renders/final.mp4") return "exports/final.mp4";
  if (rel === "renders/commands.txt") return "exports/commands.txt";
  return rel;
}

// Migrasi satu proyek layout lama ke layout v2 di tempatnya: pindahkan
// berkas aset, tulis ulang semua referensi .file, pecah scene ke
// scenes/*.json (lewat saveProject), lalu buang folder lama. Aman
// dijalankan berulang: proyek yang sudah v2 dilewati.
export function migrateProjectLayout(id) {
  const project = loadProject(id);
  if (!project) return { id, migrated: false, reason: "tidak ditemukan" };
  const dir = projectDir(id);
  let moved = 0;
  const move = (fromRel, toRel) => {
    const from = path.join(dir, fromRel);
    const to = path.join(dir, toRel);
    if (fromRel !== toRel && fs.existsSync(from)) {
      ensureDir(path.dirname(to));
      fs.renameSync(from, to);
      moved++;
    }
  };
  // Sapu folder lama berkas demi berkas (menangkap juga berkas yatim
  // yang tidak lagi dirujuk field mana pun).
  const sweepMove = (legacySub, mapName) => {
    const legacyDir = path.join(dir, legacySub);
    let names = [];
    try {
      names = fs.readdirSync(legacyDir);
    } catch {
      return;
    }
    for (const name of names) {
      const abs = path.join(legacyDir, name);
      if (!fs.statSync(abs).isFile()) continue;
      move(`${legacySub}/${name}`, mapName(name));
    }
  };
  sweepMove("stills", (n) => `assets/images/${n}`);
  sweepMove("clips", (n) => `assets/videos/${n}`);
  sweepMove("vo", (n) => (n.startsWith("poll.") ? `assets/audio/${n}` : `assets/audio/vo-${n}`));
  sweepMove("sfx", (n) => `assets/audio/sfx-${n}`);
  sweepMove("audio", (n) => `assets/music/${n}`);
  move("renders/draft.mp4", "previews/draft.mp4");
  move("renders/final.mp4", "exports/final.mp4");
  move("renders/commands.txt", "exports/commands.txt");
  // Tulis ulang referensi berkas di objek proyek.
  const fixAsset = (asset) => {
    if (asset && typeof asset.file === "string") asset.file = rewriteLegacyRel(asset.file);
  };
  for (const scene of project.scenes || []) {
    fixAsset(scene.image);
    fixAsset(scene.vo);
    fixAsset(scene.video);
    fixAsset(scene.sfx);
  }
  fixAsset(project.poll?.vo);
  if (project.audio?.bgm) fixAsset(project.audio.bgm);
  fixAsset(project.renders?.draft);
  fixAsset(project.renders?.final);
  saveProject(project);
  // Folder lama dibuang (folder kerja render di renders/ ikut terbuang;
  // ia dibuat ulang setiap render).
  for (const legacy of ["stills", "vo", "clips", "audio", "sfx", "renders"]) {
    fs.rmSync(path.join(dir, legacy), { recursive: true, force: true });
  }
  return { id, migrated: true, filesMoved: moved, scenes: (project.scenes || []).length };
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
  // remove asset files of scenes that no longer exist (layout v2 + lama)
  const kept = new Set(merged.map((s) => s.id));
  for (const old of project.scenes) {
    if (!kept.has(old.id)) {
      sweepAssetDir(project.id, "assets/images", old.id + ".");
      sweepAssetDir(project.id, "assets/videos", old.id + ".");
      sweepAssetDir(project.id, "assets/audio", "vo-" + old.id + ".");
      sweepAssetDir(project.id, "assets/audio", "sfx-" + old.id + ".");
      sweepAssetDir(project.id, "stills", old.id + ".");
      sweepAssetDir(project.id, "vo", old.id + ".");
      sweepAssetDir(project.id, "clips", old.id + ".");
      sweepAssetDir(project.id, "sfx", old.id + ".");
    }
  }
  project.scenes = merged;
  return project;
}
