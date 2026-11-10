// Editorial engine for Videogen (fifth engine).
//
// A motion-graphics editorial format modelled on the AI showreel format
// popularised on Threads (e.g. @odipramadika): warm cream paper, ONE hero
// object image per scene (AI-generated), huge condensed uppercase headline
// typography with one italic-serif accent word and a small accent label
// pill, a dotted "+" grid and hairline rules, hard cuts every few seconds
// with a slow push-in on the hero image, NO captions (the typography is the
// hook; the narration carries the content), and a white fade-out at the end.
// Drawn by stickman-runtime/scripts/render-editorial.mjs from a manifest
// built here. Scenes carry scene.ed: { headline, accentWord, label } and a
// normal imagePrompt + image asset, like Slides scenes.

import fs from "fs";
import path from "path";
import { execFile, execFileSync } from "child_process";
import { promisify } from "util";
import { projectDir, renderRel } from "./store.js";
import { probeDuration, STICKMAN_RUNTIME } from "./stickman.js";

const execFileP = promisify(execFile);
const RENDERER = path.join(STICKMAN_RUNTIME, "scripts", "render-editorial.mjs");

const LEAD = 0.15;
const TAIL = 0.35;
const ED_DIMS = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080] };

export const ED_ACCENT_DEFAULT = "#E94F1E";
export const ED_BG = "#F2EDE3";

function r3(n) {
  return Math.round(n * 1000) / 1000;
}

export function defaultEd() {
  return { headline: "", accentWord: "", label: "" };
}

/** Prompt gambar final untuk mesin Editorial: objek hero tunggal ala kolase editorial. */
export function editorialImagePrompt(project, scene) {
  const base = String(scene.imagePrompt || "").trim();
  const suffix =
    "editorial magazine collage style, one single hero object centered in the frame, plain warm cream paper background (#f2ede3), soft diffused studio lighting, muted stone grey and copper tones with one burnt orange accent, generous empty space around the object, refined print-advertising look, no text, no letters, no words, no watermark, no captions";
  return base ? `${base}, ${suffix}` : suffix;
}

// Builds editorial/project.json (manifest) + narration.wav in the project dir.
export function buildEditorialWork(project, kind) {
  const dir = projectDir(project.id);
  const workDir = path.join(dir, "editorial");
  fs.mkdirSync(workDir, { recursive: true });

  const scenes = project.scenes || [];
  if (scenes.length === 0) throw new Error("Belum ada scene.");
  for (const [i, s] of scenes.entries()) {
    if (s.vo?.status !== "ready" || !s.vo.file) {
      throw new Error(`Scene ${i + 1} belum punya voice over untuk dirender Editorial.`);
    }
    if (s.image?.status !== "ready" || !s.image.file) {
      throw new Error(`Scene ${i + 1} belum punya gambar hero untuk dirender Editorial.`);
    }
  }

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

  const shots = [];
  let t = LEAD;
  scenes.forEach((scene, i) => {
    const ed = scene.ed || {};
    const dur = scaled[i];
    const start = i === 0 ? 0 : t;
    const end = t + dur + (i === scenes.length - 1 ? TAIL : 0);
    shots.push({
      start: r3(start),
      end: r3(end),
      headline: String(scene.overlay || ed.headline || scene.title || ""),
      accentWord: String(ed.accentWord || ""),
      label: String(ed.label || ""),
      image: path.join(dir, scene.image.file),
    });
    t += dur;
  });

  const [fw, fh] = ED_DIMS[project.aspect] || ED_DIMS["9:16"];
  const draft = kind === "draft";
  const edCfg = project.editorial || {};
  const manifest = {
    version: 1,
    width: draft ? fw / 2 : fw,
    height: draft ? fh / 2 : fh,
    fps: draft ? 24 : 30,
    crf: draft ? 26 : 20,
    bg: ED_BG,
    accent: /^#[0-9a-fA-F]{6}$/.test(edCfg.accent || "") ? edCfg.accent : ED_ACCENT_DEFAULT,
    watermark: String(edCfg.watermark || ""),
    narration: "narration.wav",
    ...(draft ? { maxSeconds: 20 } : {}),
    shots,
  };
  fs.writeFileSync(path.join(workDir, "project.json"), JSON.stringify(manifest, null, 2));
  return { workDir, total: voiceTotal + LEAD + TAIL };
}

// kind: "draft" (first 20s, half size) | "final". Returns { file, duration }.
export async function renderEditorial(project, kind, onMessage) {
  const log = onMessage || (() => {});
  const dir = projectDir(project.id);
  const { workDir } = buildEditorialWork(project, kind);
  const out = path.join(workDir, kind === "draft" ? "draft.mp4" : "film.mp4");
  log(kind === "draft" ? "Merender pratinjau Editorial (20 detik pertama)..." : "Merender film Editorial penuh...");
  try {
    await execFileP("node", [RENDERER, path.join(workDir, "project.json"), out], {
      cwd: STICKMAN_RUNTIME,
      timeout: 1000 * 60 * 30,
      maxBuffer: 1024 * 1024 * 32,
    });
  } catch (e) {
    const tail = String(e.stderr || e.stdout || e.message || e).slice(-700);
    throw new Error(`Renderer Editorial gagal: ${tail}`);
  }
  const rel = renderRel(kind);
  fs.copyFileSync(out, path.join(dir, rel));
  return { file: rel, duration: probeDuration(out) };
}
