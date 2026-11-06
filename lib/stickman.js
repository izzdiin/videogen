// Stickman engine (B1) for Videogen.
//
// Vendored runtime: the "Autopilot" renderer from kaomei/stickman-video-director
// (MIT, see stickman-runtime/LICENSE). It draws layered hand-drawn scenes on
// canvas from a declarative manifest (shots must tile the narration exactly),
// burns semantic single-line captions and mixes procedural SFX, outputting MP4.
//
// This module turns a Videogen project (per-scene VO files + scene.stick specs)
// into that manifest, then drives the runtime CLI: validate -> preview ->
// approve -> render. Captions are built from our own narration text (semantic
// clause split, timing proportional to text length inside each scene's real VO
// duration) — no Whisper and no direct Gemini API key needed.

import fs from "fs";
import path from "path";
import { execFile, execFileSync } from "child_process";
import { promisify } from "util";
import { projectDir, loadProject, saveProject } from "./store.js";
import { generateImage, generateImageVia9Router, generateImageViaBridge } from "./ai.js";

const execFileP = promisify(execFile);

export const STICKMAN_RUNTIME = path.join(process.cwd(), "stickman-runtime");
const CLI = path.join(STICKMAN_RUNTIME, "scripts", "autopilot.mjs");

export const B1_PROPS = [
  { id: "bulb", label: "Bohlam ide", file: "@b1/idea-bulb-crayon.png" },
  { id: "note", label: "Catatan ide", file: "@b1/idea-note-crayon.png" },
  { id: "youtube", label: "YouTube", file: "@b1/youtube-crayon.png" },
  { id: "camera", label: "Kamera", file: "@b1/camera-handdrawn.png" },
  { id: "clapper", label: "Clapper film", file: "@b1/clapper-crayon.png" },
  { id: "calendar", label: "Kalender", file: "@b1/calendar-crayon.png" },
  { id: "opensource", label: "Open source", file: "@b1/open-source-crayon.png" },
  { id: "script", label: "Halaman naskah", file: "@b1/script-page-crayon.png" },
];
export const B1_PROP_FILES = Object.fromEntries(B1_PROPS.map((p) => [p.id, p.file]));
export const STICK_SFX = ["pop", "tap", "paper", "chime"];
export const STICK_POSES = [
  { id: 0, label: "Mencondong / berpikir" },
  { id: 1, label: "Berdiri menyajikan" },
  { id: 2, label: "Beraksi" },
];

const LEAD = 0.15;
const TAIL = 0.35;
const ACCENT = "#EC4338";

function r3(n) {
  return Math.round(n * 1000) / 1000;
}

export function probeDuration(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file],
    { encoding: "utf8" }
  );
  const d = parseFloat(out.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`Tidak bisa membaca durasi: ${file}`);
  return d;
}

// Split narration into semantic caption cues: clause boundaries first, then
// greedy packing to a readable single-line length. This is text-proportional
// captioning from our own script, not forced alignment.
export function splitCaptions(text, maxLen = 46) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return [];
  const parts = (raw.match(/[^,.;:!?]+[,.;:!?]*/g) || [raw]).map((s) => s.trim()).filter(Boolean);
  const cues = [];
  let cur = "";
  const push = () => {
    if (cur) cues.push(cur);
    cur = "";
  };
  for (const part of parts) {
    if (part.length > maxLen) {
      push();
      let rest = part;
      while (rest.length > maxLen) {
        let cut = rest.lastIndexOf(" ", maxLen);
        if (cut < 12) cut = maxLen;
        cues.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      cur = rest;
      continue;
    }
    if (cur && cur.length + 1 + part.length > maxLen) push();
    cur = cur ? `${cur} ${part}` : part;
  }
  push();
  return cues;
}

// Design plane is always 1280 units wide; height follows the aspect
// (9:16 -> 2275.6, 1:1 -> 1280, 16:9 -> 720). Layouts spread content over the
// full plane so portrait/square frames do not leave a dead lower band.
const STICK_DIMS = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080] };
const STICK_LAYOUTS = {
  "9:16": {
    lineX: 90, lineY: 240, lineDy: 155, lineSize: 88,
    pose: { x: 250, y: 690, w: 780 },
    props: [{ x: 45, y: 1000 }, { x: 935, y: 1000 }], propW: 320,
  },
  "1:1": {
    lineX: 90, lineY: 120, lineDy: 135, lineSize: 72,
    pose: { x: 350, y: 470, w: 580 },
    props: [{ x: 60, y: 580 }, { x: 950, y: 580 }], propW: 270,
  },
  "16:9": {
    lineX: 90, lineY: 105, lineDy: 80, lineSize: 58,
    pose: { x: 700, y: 25, w: 440 },
    props: [{ x: 100, y: 270 }, { x: 395, y: 290 }], propW: 250,
  },
};

export const B2_STYLE_SUFFIX =
  "colorful hand-drawn illustration, bright warm cream paper background, soft daylight, light airy warm tones, thin irregular ink outlines, muted watercolor colors with teal, coral, mustard and sage accents, one simple round-headed stick figure with dot eyes and a short line mouth as the main character, cozy everyday hand-drawn scene, storybook doodle style, full-bleed composition with no vignette, the top 22 percent of the frame is completely blank warm cream paper with no objects, shelves, lines or details, no text, no words, no letters";

export function b2ArtPrompt(scene) {
  const base = String(scene.imagePrompt || scene.title || "an everyday scene").trim();
  return `${base}, ${B2_STYLE_SUFFIX}`;
}

export const B3_STYLE_SUFFIX =
  "retro television cartoon still, near-black dark background, flat white and light gray silhouettes only, refined minimal shapes, blank round heads with no facial features, rounded joints, generous negative space, at most one small muted red accent, clean flat vector illustration, subtle analog broadcast mood, no color gradients, no photorealism, no text, no words, no letters, the top 18 percent of the frame is completely empty dark space";

export function b3ArtPrompt(scene) {
  const base = String(scene.imagePrompt || scene.title || "a silhouette scene").trim();
  return `${base}, ${B3_STYLE_SUFFIX}`;
}

const B2_PLANE_H = { "9:16": 2276, "1:1": 1280, "16:9": 720 };

function layersB2For(project, scene, workDir) {
  const layers = [];
  if (scene.image?.file) {
    const src = path.join(projectDir(project.id), scene.image.file);
    if (fs.existsSync(src)) {
      const name = `art-${scene.id}${path.extname(scene.image.file) || ".jpg"}`;
      fs.copyFileSync(src, path.join(workDir, name));
      layers.push({ type: "image", path: name, x: 0, y: 0, w: 1280, h: B2_PLANE_H[project.aspect] || 2276 });
    }
  }
  const st = scene.stick || {};
  const lines = [scene.overlay || scene.title || "", st.lines?.[1] || ""].filter(Boolean).slice(0, 2);
  const hy = { "9:16": 110, "1:1": 70, "16:9": 46 }[project.aspect] || 110;
  const hs = { "9:16": 76, "1:1": 62, "16:9": 44 }[project.aspect] || 76;
  lines.forEach((text, j) => {
    layers.push({
      type: "text",
      text,
      x: 70,
      y: hy + j * (hs + 22),
      size: hs,
      bold: true,
      ...(j === 1 ? { color: "#C0452F" } : {}),
    });
  });
  return layers;
}

function layersB3For(project, scene, workDir) {
  const layers = [];
  if (scene.image?.file) {
    const src = path.join(projectDir(project.id), scene.image.file);
    if (fs.existsSync(src)) {
      const name = `art-${scene.id}${path.extname(scene.image.file) || ".jpg"}`;
      fs.copyFileSync(src, path.join(workDir, name));
      layers.push({ type: "image", path: name, x: 0, y: 0, w: 1280, h: B2_PLANE_H[project.aspect] || 2276 });
    }
  }
  const st = scene.stick || {};
  const lines = [scene.overlay || scene.title || "", st.lines?.[1] || ""].filter(Boolean).slice(0, 2);
  const hy = { "9:16": 110, "1:1": 70, "16:9": 46 }[project.aspect] || 110;
  const hs = { "9:16": 64, "1:1": 54, "16:9": 40 }[project.aspect] || 64;
  lines.forEach((text, j) => {
    layers.push({
      type: "text",
      text: String(text).toUpperCase(),
      x: 70,
      y: hy + j * (hs + 20),
      size: hs,
      bold: true,
      ...(j === 1 ? { color: "#9aa3ab" } : {}),
    });
  });
  return layers;
}

function layersFor(project, scene, idx, workDir) {
  if (project.stickStyle === "B2") return layersB2For(project, scene, workDir);
  if (project.stickStyle === "B3") return layersB3For(project, scene, workDir);
  const st = scene.stick || {};
  const L = STICK_LAYOUTS[project.aspect] || STICK_LAYOUTS["9:16"];
  const layers = [];
  const line1 = scene.overlay || scene.title || "";
  const line2 = st.lines?.[1] || "";
  const lines = [line1, line2].filter(Boolean).slice(0, 2);
  lines.forEach((text, j) => {
    layers.push({
      type: "text",
      text,
      x: L.lineX,
      y: L.lineY + j * L.lineDy,
      size: L.lineSize,
      bold: true,
      ...(j === 1 ? { color: ACCENT } : {}),
    });
  });

  const pose = Number.isInteger(st.pose) ? st.pose : idx % 3;
  if (pose >= 0 && pose <= 2) {
    layers.push({ type: "pose", pose, ...L.pose });
  }

  const propIds = Array.isArray(st.props) ? st.props.filter((p) => B1_PROP_FILES[p]) : [];
  const propLayers = propIds.map((p) => ({ file: B1_PROP_FILES[p] }));
  if (st.customFile) {
    const src = path.join(projectDir(project.id), st.customFile);
    if (fs.existsSync(src)) {
      const name = `prop-${scene.id}${path.extname(st.customFile) || ".png"}`;
      fs.copyFileSync(src, path.join(workDir, name));
      propLayers.push({ file: name });
    }
  }
  propLayers.slice(0, 2).forEach((p, k) => {
    const { x, y } = L.props[k];
    layers.push({
      type: "image",
      path: p.file,
      x,
      y,
      w: L.propW,
      h: L.propW,
      keys: [
        { t: 0, x: x - 40, alpha: 0 },
        { t: 0.35, x, alpha: 1 },
      ],
    });
  });
  return layers;
}

// Ensures every scene's visual assets exist for a stickman project: bundled B1
// props need nothing; a scene with stick.customPrompt gets an SDXL crayon-style
// prop generated once. Marks scene.image ready either way. Mutates + saves.
async function ensureB2Art(project, log, promptFor = b2ArtPrompt, label = "B2") {
  const dir = projectDir(project.id);
  const provider = project.executors?.imageProvider || "sdxl-9router";
  for (let i = 0; i < project.scenes.length; i++) {
    const scene = project.scenes[i];
    const needs = !scene.image?.file || scene.image.status !== "ready" || scene.image.stale;
    if (!needs) continue;
    if (!scene.imagePrompt?.trim()) continue; // no art direction: scene renders as heading only
    if (provider === "upload") continue; // manual: illustration comes from the user's upload
    log(`Membuat ilustrasi ${label} scene ${i + 1}/${project.scenes.length}...`);
    const rel = `stills/${scene.id}.jpg`;
    fs.mkdirSync(path.join(dir, "stills"), { recursive: true });
    let source = "sdxl-9router";
    if (provider === "pollinations") {
      const seed = Math.floor(Math.random() * 1_000_000);
      await generateImage(promptFor(scene), path.join(dir, rel), seed, undefined, project.aspect);
      source = "pollinations";
    } else if (provider === "muse-bridge") {
      log(`Muse sedang membuat ilustrasi ${label} scene ${i + 1}/${project.scenes.length} (bisa beberapa menit)...`);
      await generateImageViaBridge(promptFor(scene), path.join(dir, rel), project.aspect);
      source = "muse-bridge";
    } else {
      await generateImageVia9Router(promptFor(scene), path.join(dir, rel), project.aspect);
    }
    const fresh = loadProject(project.id);
    fresh.scenes[i].image = { status: "ready", file: rel, source, updatedAt: new Date().toISOString() };
    saveProject(fresh);
    project.scenes[i] = fresh.scenes[i];
  }
  return project;
}

export async function ensureStickmanProps(project, onMessage) {
  const log = onMessage || (() => {});
  if (project.stickStyle === "B2") return ensureB2Art(project, log);
  if (project.stickStyle === "B3") return ensureB2Art(project, log, b3ArtPrompt, "B3");
  const dir = projectDir(project.id);
  for (let i = 0; i < project.scenes.length; i++) {
    const scene = project.scenes[i];
    const st = scene.stick || {};
    if (st.customPrompt && !st.customFile) {
      log(`Membuat properti khusus scene ${i + 1}/${project.scenes.length}...`);
      const rel = `props/${scene.id}.png`;
      fs.mkdirSync(path.join(dir, "props"), { recursive: true });
      await generateImageVia9Router(
        `${st.customPrompt}, single object centered, hand-drawn crayon doodle sticker, thick uneven black outline, flat warm colors, plain solid white background, simple cute children's book illustration, no text`,
        path.join(dir, rel)
      );
      const fresh = loadProject(project.id);
      fresh.scenes[i].stick = { ...(fresh.scenes[i].stick || {}), customFile: rel };
      fresh.scenes[i].image = { status: "ready", file: rel, source: "sdxl-9router", updatedAt: new Date().toISOString() };
      saveProject(fresh);
      project.scenes[i] = fresh.scenes[i];
    } else if (scene.image?.status !== "ready") {
      scene.image = { status: "ready", source: "stickman-b1", updatedAt: new Date().toISOString() };
      saveProject(project);
    }
  }
  return project;
}

// Builds stickman/project.json + narration.wav inside the project dir.
// Returns { workDir, total }.
export function buildStickmanWork(project) {
  const dir = projectDir(project.id);
  const workDir = path.join(dir, "stickman");
  fs.mkdirSync(workDir, { recursive: true });

  const scenes = project.scenes || [];
  if (scenes.length === 0) throw new Error("Belum ada scene.");
  for (const s of scenes) {
    if (s.vo?.status !== "ready" || !s.vo.file) {
      throw new Error("Semua scene harus punya voice over sebelum dirender stickman.");
    }
  }

  // Continuous narration track: concat per-scene VO to WAV (exact samples).
  const listFile = path.join(workDir, "concat.txt");
  fs.writeFileSync(
    listFile,
    scenes.map((s) => `file '${path.join(dir, s.vo.file).replace(/'/g, "'\\''")}'`).join("\n")
  );
  execFileSync("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0", "-i", listFile,
    "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", path.join(workDir, "narration.wav"),
  ], { stdio: "pipe" });

  const durations = scenes.map((s) => probeDuration(path.join(dir, s.vo.file)));
  const voiceTotal = probeDuration(path.join(workDir, "narration.wav"));
  const sum = durations.reduce((a, b) => a + b, 0);
  const scale = sum > 0 ? voiceTotal / sum : 1;
  const scaled = durations.map((d) => d * scale);

  const captions = [];
  const shots = [];
  const sfx = [];
  let t = LEAD;
  scenes.forEach((scene, i) => {
    const dur = scaled[i];
    const start = i === 0 ? 0 : t;
    const end = t + dur + (i === scenes.length - 1 ? TAIL : 0);
    shots.push({ start: r3(start), end: r3(end), layers: layersFor(project, scene, i, workDir) });

    const cues = splitCaptions(scene.narration);
    const totalChars = cues.reduce((a, c) => a + c.length, 0) || 1;
    let ct = t;
    cues.forEach((cue, k) => {
      const cd = k === cues.length - 1 ? t + dur - ct : Math.max(0.5, dur * (cue.length / totalChars));
      captions.push({ start: r3(ct), end: r3(ct + cd), text: cue });
      ct += cd;
    });

    const kind = scene.stick?.sfx;
    if (kind && STICK_SFX.includes(kind)) {
      sfx.push({ time: r3(t + 0.05), kind, gain: 0.03 });
    }
    t += dur;
  });

  const [mw, mh] = STICK_DIMS[project.aspect] || STICK_DIMS["9:16"];
  const manifest = {
    version: 1,
    style: project.stickStyle || "B1",
    // B3 television finish is NOT done by the runtime: its per-frame JS pass
    // takes >24 min for a 20s preview on laptopgrt (measured 6 Nov). The
    // runtime renders clean and applyTvFinish() adds scanlines + vignette
    // with native ffmpeg after the render instead.
    ...(project.stickStyle === "B3" ? { television: { enabled: false, intensity: 0.45 } } : {}),
    width: mw,
    height: mh,
    fps: 30,
    voice: { path: "narration.wav", lead: LEAD, tail: TAIL },
    captions,
    shots,
    sfx,
  };
  fs.writeFileSync(path.join(workDir, "project.json"), JSON.stringify(manifest, null, 2));
  return { workDir, total: voiceTotal + LEAD + TAIL };
}

async function runCli(args) {
  try {
    await execFileP("node", [CLI, ...args], {
      cwd: STICKMAN_RUNTIME,
      timeout: 1000 * 60 * 30,
      maxBuffer: 1024 * 1024 * 32,
    });
  } catch (e) {
    const tail = String(e.stderr || e.stdout || e.message || e).slice(-700);
    throw new Error(`Renderer stickman gagal (${args[0]}): ${tail}`);
  }
}

// B3 television finish as a native ffmpeg pass over the runtime's clean
// output: scanlines (every 3rd row darkened), a vignette, and a slight
// analog saturation/contrast shift. Replaces the runtime's own television
// pass, which is prohibitively slow on laptopgrt (see buildStickmanWork).
// Scanlines are an RGBA pattern PNG overlaid on the video (one transparent
// frame, black@22% every 3rd row). Two earlier attempts failed in opposite
// ways: a per-pixel geq over the whole film took ~11 min for 20s on
// laptopgrt, and a multiply-blend of a drawgrid pattern tinted whites
// green (129,255,102 measured) through YUV format negotiation. The overlay
// of an RGBA pattern is fast and color-neutral (white stays 255,255,255).
async function applyTvFinish(file, kind, w, h) {
  const tmp = file.replace(/\.mp4$/, ".tv.mp4");
  const pat = file.replace(/\.mp4$/, ".scanlines.png");
  await execFileP("ffmpeg", [
    "-y", "-f", "lavfi",
    "-i", `color=black@0.0:size=${w}x${h},format=rgba,geq=r='0':g='0':b='0':a='if(eq(mod(Y\\,3)\\,0)\\,56\\,0)'`,
    "-frames:v", "1", pat,
  ], { timeout: 1000 * 60 * 2, maxBuffer: 1024 * 1024 * 32 });
  try {
    await execFileP("ffmpeg", [
      "-y", "-i", file,
      "-loop", "1", "-i", pat,
      "-filter_complex",
      "[0:v][1:v]overlay=shortest=1,vignette=angle=PI/6,eq=saturation=0.94:contrast=1.03[out]",
      "-map", "[out]", "-map", "0:a?",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", kind === "draft" ? "24" : "20",
      "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", "-shortest",
      tmp,
    ], { timeout: 1000 * 60 * 30, maxBuffer: 1024 * 1024 * 32 });
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(pat, { force: true });
  }
}

// kind: "draft" (preview 20s) | "final" (preview + approve + full render).
// Mirrors renderProject's return shape: { file, duration }.
export async function renderStickman(project, kind, onMessage) {
  const log = onMessage || (() => {});
  const dir = projectDir(project.id);
  const { workDir } = buildStickmanWork(project);
  const manifestPath = path.join(workDir, "project.json");
  const outDir = path.join(workDir, "output");
  const isB3 = (project.stickStyle || "B1") === "B3";
  const [tvW, tvH] = STICK_DIMS[project.aspect] || STICK_DIMS["9:16"];

  log("Memvalidasi manifest stickman...");
  await runCli(["validate", manifestPath]);

  if (kind === "draft") {
    log("Merender pratinjau stickman (20 detik pertama)...");
    await runCli(["preview", manifestPath, "--seconds", "20", "--replace"]);
    const src = path.join(outDir, "preview.mp4");
    if (isB3) {
      log("Menerapkan finish TV (ffmpeg)...");
      await applyTvFinish(src, "draft", tvW, tvH);
    }
    const rel = "renders/draft.mp4";
    fs.copyFileSync(src, path.join(dir, rel));
    return { file: rel, duration: probeDuration(src) };
  }

  log("Merender pratinjau stickman...");
  await runCli(["preview", manifestPath, "--replace"]);
  await runCli(["approve", manifestPath, "--note", "Videogen: render final dipicu pengguna dari aplikasi"]);
  log("Merender film stickman penuh...");
  await runCli(["render", manifestPath, "--replace"]);
  const src = path.join(outDir, "film.mp4");
  if (isB3) {
    log("Menerapkan finish TV (ffmpeg)...");
    await applyTvFinish(src, "final", tvW, tvH);
  }
  const rel = "renders/final.mp4";
  fs.copyFileSync(src, path.join(dir, rel));
  return { file: rel, duration: probeDuration(src) };
}
