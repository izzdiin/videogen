// Dark Card engine for Videogen (third engine).
//
// A dark "UI card" explainer format drawn entirely on canvas by
// stickman-runtime/scripts/render-darkcard.mjs: navy background, chip + mono
// title header, a CUMULATIVE stack of icon cards (each scene adds one card),
// a large caption with one highlighted phrase, and the project's own
// watermark + accent color (both user-chosen per project).
//
// Like the stickman engine, shots must tile the narration exactly; captions
// are semantic cues from our own narration text with proportional timing.

import fs from "fs";
import path from "path";
import { execFile, execFileSync } from "child_process";
import { promisify } from "util";
import { projectDir } from "./store.js";
import { splitCaptions, probeDuration, STICKMAN_RUNTIME } from "./stickman.js";
import { DC_ICON_IDS } from "./dc-icons.js";

const execFileP = promisify(execFile);
const RENDERER = path.join(STICKMAN_RUNTIME, "scripts", "render-darkcard.mjs");

const LEAD = 0.15;
const TAIL = 0.35;
const DC_DIMS = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080] };

function r3(n) {
  return Math.round(n * 1000) / 1000;
}

export function defaultDc() {
  return { kind: "", chip: "", card: null, highlight: "" };
}

// Builds darkcard/project.json (manifest) + narration.wav in the project dir.
export function buildDarkcardWork(project, kind) {
  const dir = projectDir(project.id);
  const workDir = path.join(dir, "darkcard");
  fs.mkdirSync(workDir, { recursive: true });

  const scenes = project.scenes || [];
  if (scenes.length === 0) throw new Error("Belum ada scene.");
  for (const s of scenes) {
    if (s.vo?.status !== "ready" || !s.vo.file) {
      throw new Error("Semua scene harus punya voice over sebelum dirender Dark Card.");
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
  const stack = [];
  let t = LEAD;
  scenes.forEach((scene, i) => {
    const dc = scene.dc || {};
    const dur = scaled[i];
    const start = i === 0 ? 0 : t;
    const end = t + dur + (i === scenes.length - 1 ? TAIL : 0);

    if (dc.card && dc.card.label) {
      for (const c of stack) c.isNew = false;
      stack.push({
        icon: DC_ICON_IDS.includes(dc.card.icon) ? dc.card.icon : "file",
        label: String(dc.card.label || ""),
        note: String(dc.card.note || ""),
        isNew: true,
      });
    }
    const kindOf = ["hook", "problem", "result"].includes(dc.kind)
      ? dc.kind
      : i === scenes.length - 1 && scenes.length > 2
        ? "result"
        : i === 0
          ? "hook"
          : "problem";
    const chip = String(dc.chip || "") ||
      (kindOf === "result" ? "HASIL" : kindOf === "hook" ? "PEMBUKA" : "MASALAH");

    const cues = splitCaptions(scene.narration, 40);
    const totalChars = cues.reduce((a, c) => a + c.length, 0) || 1;
    const captions = [];
    let ct = t;
    cues.forEach((cue, k) => {
      const cd = k === cues.length - 1 ? t + dur - ct : Math.max(0.5, dur * (cue.length / totalChars));
      captions.push({ start: r3(ct), end: r3(ct + cd), text: cue, highlight: String(dc.highlight || "") });
      ct += cd;
    });

    shots.push({
      start: r3(start),
      end: r3(end),
      chip,
      kind: kindOf,
      title: scene.overlay || scene.title || "",
      cards: stack.map((c) => ({ ...c })),
      captions,
    });
    t += dur;
  });

  const [fw, fh] = DC_DIMS[project.aspect] || DC_DIMS["9:16"];
  const draft = kind === "draft";
  const dcCfg = project.darkcard || {};
  const manifest = {
    version: 1,
    width: draft ? fw / 2 : fw,
    height: draft ? fh / 2 : fh,
    fps: draft ? 24 : 30,
    crf: draft ? 26 : 20,
    bg: "#0A1128",
    accent: /^#[0-9a-fA-F]{6}$/.test(dcCfg.accent || "") ? dcCfg.accent : "#F26D8D",
    watermark: String(dcCfg.watermark || ""),
    narration: "narration.wav",
    ...(draft ? { maxSeconds: 20 } : {}),
    shots,
  };
  fs.writeFileSync(path.join(workDir, "project.json"), JSON.stringify(manifest, null, 2));
  return { workDir, total: voiceTotal + LEAD + TAIL };
}

// kind: "draft" (first 20s, half size) | "final". Returns { file, duration }.
export async function renderDarkcard(project, kind, onMessage) {
  const log = onMessage || (() => {});
  const dir = projectDir(project.id);
  const { workDir } = buildDarkcardWork(project, kind);
  const out = path.join(workDir, kind === "draft" ? "draft.mp4" : "film.mp4");
  log(kind === "draft" ? "Merender pratinjau Dark Card (20 detik pertama)..." : "Merender film Dark Card penuh...");
  try {
    await execFileP("node", [RENDERER, path.join(workDir, "project.json"), out], {
      cwd: STICKMAN_RUNTIME,
      timeout: 1000 * 60 * 30,
      maxBuffer: 1024 * 1024 * 32,
    });
  } catch (e) {
    const tail = String(e.stderr || e.stdout || e.message || e).slice(-700);
    throw new Error(`Renderer Dark Card gagal: ${tail}`);
  }
  const rel = `renders/${kind}.mp4`;
  fs.copyFileSync(out, path.join(dir, rel));
  return { file: rel, duration: probeDuration(out) };
}
