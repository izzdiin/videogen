// Diagram engine for Videogen (fourth engine).
//
// A "diagram explainer" format in the style of @kemasjumansyahhm's reels:
// ONE flat-vector diagram on a warm cream canvas that is built up step by
// step (components pop in, cables are drawn between them), a virtual camera
// panning/zooming across it, a per-section headline with one accent-coloured
// keyword, a status pill, karaoke-style phrase captions with a yellow
// highlight, and a user watermark. No AI images; everything is drawn by
// stickman-runtime/scripts/render-diagram.mjs from a manifest built here.
//
// Scenes carry scene.dg: { headline, accent, badge, badgeColor, ops,
// trackerLabel, steps, card } where ops are small diagram instructions
// resolved here into cumulative state:
//   { op: "add", comp, id, label }   a new component appears
//   { op: "connect", from, to, color }  a cable is drawn between two ids
//   { op: "focus", target }          camera target: a component id or "all"
// Fase 2 additions: trackerLabel names the tracked subject (persists);
// steps are checklist updates [{label, state: todo|ask|ok|bad}] accumulated
// across scenes; card is an optional per-scene terminal data card
// { title, lines[] } shown only during its own scene.

import fs from "fs";
import path from "path";
import { execFile, execFileSync } from "child_process";
import { promisify } from "util";
import { projectDir } from "./store.js";
import { splitCaptions, probeDuration, STICKMAN_RUNTIME } from "./stickman.js";
import { DG_COMPONENTS, DG_BADGE_COLORS, DG_CABLE_COLORS, DG_FLOW_COLORS } from "./diagram-constants.js";

export { DG_COMPONENTS, DG_COMPONENT_LABELS, DG_BADGE_COLORS, DG_CABLE_COLORS, DG_FLOW_COLORS } from "./diagram-constants.js";

const execFileP = promisify(execFile);
const RENDERER = path.join(STICKMAN_RUNTIME, "scripts", "render-diagram.mjs");

const LEAD = 0.15;
const TAIL = 0.35;
const DG_DIMS = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080] };
const MAX_COMPONENTS = 8;
const SLOT_DX = 300;
const FIRST_X = 230;
const GROUND_Y = 640;

function r3(n) {
  return Math.round(n * 1000) / 1000;
}

export function defaultDg() {
  return {
    headline: "", accent: "", badge: "", badgeColor: "grey", ops: [],
    trackerLabel: "", steps: [], card: null,
    keyword: "", data: [],
  };
}

export const DG_STEP_STATES = ["todo", "ask", "ok", "bad"];

export function dgComponentHeight(comp) {
  return {
    hp: 215, bts: 405, server: 265, monitor: 195, router: 95, cloud: 135,
    database: 205, orang: 235, rumah: 245, gembok: 175, chat: 155, dokumen: 215,
    kotak: 175, "panel-surya": 185, baterai: 150, bank: 235, globe: 200,
    satelit: 185, mobil: 145, lampu: 255, "panah-panas": 190, aliran: 215,
  }[comp] || 175;
}

// Camera focus widths per aspect (Fase 3): wider planes need a wider view
// so tall components (BTS 405) still fit vertically under the HUD zone.
const DG_FOCUS_W = { "9:16": 880, "1:1": 1120, "16:9": 1600 };
const DG_FOCUS_W_SMALL = { "9:16": 1020, "1:1": 1300, "16:9": 1800 };

// Resolve every scene's ops into the cumulative diagram state + camera move
// for that section. Pure and exported for testing.
export function resolveDiagram(scenes, aspect = "9:16") {
  const focusW = DG_FOCUS_W[aspect] || DG_FOCUS_W["9:16"];
  const focusWSmall = DG_FOCUS_W_SMALL[aspect] || DG_FOCUS_W_SMALL["9:16"];
  const comps = new Map();
  const cables = [];
  const sections = [];
  let prevCam = null;
  let subject = "";
  const stepList = [];
  scenes.forEach((scene, i) => {
    const dg = scene.dg || {};
    const ops = Array.isArray(dg.ops) ? dg.ops : [];
    // Tracker (Fase 2): subject label persists once set; steps accumulate by
    // label, later scenes may change an earlier step's state.
    if (dg.trackerLabel) subject = String(dg.trackerLabel).slice(0, 30);
    const freshSteps = new Set();
    for (const st of Array.isArray(dg.steps) ? dg.steps : []) {
      if (!st || typeof st !== "object" || !st.label) continue;
      const label = String(st.label).slice(0, 10);
      const state = DG_STEP_STATES.includes(st.state) ? st.state : "todo";
      const ex = stepList.find((s) => s.label.toLowerCase() === label.toLowerCase());
      if (ex) {
        if (ex.state !== state) { ex.state = state; freshSteps.add(ex.label); }
      } else if (stepList.length < 5) {
        stepList.push({ label, state });
        freshSteps.add(label);
      }
    }
    let focus = null;
    let lastAdded = null;
    for (const op of ops) {
      if (!op || typeof op !== "object") continue;
      if (op.op === "add" && op.id && !comps.has(op.id) && comps.size < MAX_COMPONENTS) {
        const comp = DG_COMPONENTS.includes(op.comp) ? op.comp : "kotak";
        const x = FIRST_X + comps.size * SLOT_DX;
        comps.set(op.id, {
          id: op.id, comp, label: String(op.label || "").slice(0, 26),
          x, h: dgComponentHeight(comp), addedIn: i,
        });
        lastAdded = op.id;
      } else if (op.op === "connect" && comps.has(op.from) && comps.has(op.to)) {
        const dup = cables.some((c) => (c.from === op.from && c.to === op.to) || (c.from === op.to && c.to === op.from));
        if (!dup) {
          cables.push({
            from: op.from, to: op.to,
            color: DG_CABLE_COLORS[op.color] || DG_CABLE_COLORS.blue,
            addedIn: i,
          });
        }
      } else if (op.op === "focus") {
        focus = String(op.target || "all");
      }
    }
    const worldW = Math.max(1500, FIRST_X + comps.size * SLOT_DX + 120);
    const wide = { cx: worldW / 2, w: Math.max(worldW, focusW) };
    let cam;
    if (i === scenes.length - 1 && scenes.length > 1) {
      cam = wide; // closing wide shot, like the reference format
    } else if (focus && focus !== "all" && comps.has(focus)) {
      cam = { cx: comps.get(focus).x, w: focusW };
    } else if (focus === "all") {
      cam = wide;
    } else if (lastAdded && comps.has(lastAdded)) {
      cam = { cx: comps.get(lastAdded).x, w: comps.size <= 2 ? focusWSmall : focusW };
    } else {
      cam = prevCam || wide;
    }
    sections.push({
      components: [...comps.values()].map((c) => ({
        id: c.id, comp: c.comp, label: c.label, x: c.x, h: c.h, isNew: c.addedIn === i,
      })),
      cables: cables.map((c) => {
        const a = comps.get(c.from), b = comps.get(c.to);
        return {
          x1: a.x, y1: GROUND_Y - a.h + 26, x2: b.x, y2: GROUND_Y - b.h + 26,
          color: c.color, isNew: c.addedIn === i,
        };
      }),
      camTo: cam,
      worldW,
      tracker: {
        subject,
        steps: stepList.map((s) => ({ label: s.label, state: s.state, fresh: freshSteps.has(s.label) })),
      },
    });
    prevCam = cam;
  });
  return sections;
}

// Mode Bedah (Fase B): every section is its own PAGE — only that section's
// components, centred on a fixed wide camera, plus curved "flow" arrows
// between components. Nothing accumulates across sections.
export function resolveBedah(scenes) {
  const worldW = 1500;
  return scenes.map((scene, i) => {
    const dg = scene.dg || {};
    const ops = Array.isArray(dg.ops) ? dg.ops : [];
    const comps = new Map();
    const order = [];
    for (const op of ops) {
      if (!op || typeof op !== "object") continue;
      if (op.op === "add" && op.id && !comps.has(op.id) && comps.size < 6) {
        const comp = DG_COMPONENTS.includes(op.comp) ? op.comp : "kotak";
        comps.set(op.id, {
          id: op.id, comp, label: String(op.label || "").slice(0, 26),
          h: dgComponentHeight(comp),
        });
        order.push(op.id);
      }
    }
    const n = order.length;
    order.forEach((id, k) => {
      const c = comps.get(id);
      c.x = worldW / 2 + (k - (n - 1) / 2) * SLOT_DX;
    });
    const cables = [];
    const flows = [];
    for (const op of ops) {
      if (!op || typeof op !== "object") continue;
      if (op.op === "connect" && comps.has(op.from) && comps.has(op.to)) {
        const a = comps.get(op.from), b = comps.get(op.to);
        cables.push({
          x1: a.x, y1: GROUND_Y - a.h + 26, x2: b.x, y2: GROUND_Y - b.h + 26,
          color: DG_CABLE_COLORS[op.color] || DG_CABLE_COLORS.blue, isNew: true,
        });
      } else if (op.op === "flow" && comps.has(op.from) && comps.has(op.to)) {
        const a = comps.get(op.from), b = comps.get(op.to);
        const kind = DG_FLOW_COLORS[op.kind] ? op.kind : "netral";
        flows.push({
          x1: a.x, y1: GROUND_Y - a.h * 0.55, x2: b.x, y2: GROUND_Y - b.h * 0.55,
          kind, color: DG_FLOW_COLORS[kind],
        });
      }
    }
    return {
      components: order.map((id) => {
        const c = comps.get(id);
        return { id: c.id, comp: c.comp, label: c.label, x: c.x, h: c.h, isNew: true };
      }),
      cables,
      flows,
      // Bedah pages zoom IN on the subject (w 980 vs the 1500-wide world)
      // so the diagram reads large like the reference, not as a wide shot.
      camTo: { cx: worldW / 2, w: 980 },
      worldW,
      tracker: { subject: "", steps: [] },
    };
  });
}

// Validate a scene's Bedah data cards (max 2): label / big value / result.
export function bedahDataCards(dg) {
  const out = [];
  for (const d of Array.isArray(dg?.data) ? dg.data.slice(0, 2) : []) {
    if (!d || typeof d !== "object") continue;
    const value = String(d.value || "").slice(0, 14);
    if (!value) continue;
    out.push({
      label: String(d.label || "").slice(0, 30),
      value,
      result: String(d.result || "").slice(0, 34),
      tone: d.tone === "hot" ? "hot" : "plain",
    });
  }
  return out;
}

function cueHighlight(cue, accent) {
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").trim();
  const words = cue.split(/\s+/).filter(Boolean);
  const acc = norm(accent || "");
  if (acc) {
    const hit = words.find((w) => norm(w) === acc.split(" ")[0]);
    if (hit) return hit.replace(/[^\p{L}\p{N}]/gu, "");
  }
  const longest = words.reduce((a, w) => (w.replace(/[^\p{L}\p{N}]/gu, "").length > (a?.length || 0) ? w.replace(/[^\p{L}\p{N}]/gu, "") : a), "");
  return longest || "";
}

// Builds diagram/project.json (manifest) + narration.wav in the project dir.
export function buildDiagramWork(project, kind) {
  const dir = projectDir(project.id);
  const workDir = path.join(dir, "diagram");
  fs.mkdirSync(workDir, { recursive: true });

  const scenes = project.scenes || [];
  if (scenes.length === 0) throw new Error("Belum ada scene.");
  for (const s of scenes) {
    if (s.vo?.status !== "ready" || !s.vo.file) {
      throw new Error("Semua scene harus punya voice over sebelum dirender Diagram.");
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

  const bedah = project.diagram?.mode === "bedah";
  const resolved = bedah ? resolveBedah(scenes) : resolveDiagram(scenes, project.aspect);
  const sections = [];
  let t = LEAD;
  scenes.forEach((scene, i) => {
    const dg = scene.dg || {};
    const dur = scaled[i];
    const start = i === 0 ? 0 : t;
    const end = t + dur + (i === scenes.length - 1 ? TAIL : 0);

    const cues = splitCaptions(scene.narration, 36);
    const totalChars = cues.reduce((a, c) => a + c.length, 0) || 1;
    const captions = [];
    let ct = t;
    cues.forEach((cue, k) => {
      const cd = k === cues.length - 1 ? t + dur - ct : Math.max(0.5, dur * (cue.length / totalChars));
      captions.push({ start: r3(ct), end: r3(ct + cd), text: cue, highlight: cueHighlight(cue, bedah ? (dg.keyword || dg.accent) : dg.accent) });
      ct += cd;
    });

    // Terminal data card (Fase 2): per-scene only, capped hard.
    let card = null;
    if (dg.card && Array.isArray(dg.card.lines)) {
      const lines = dg.card.lines.map((l) => String(l).slice(0, 30)).filter(Boolean).slice(0, 4);
      if (lines.length) card = { title: String(dg.card.title || "DATA").slice(0, 16), lines };
    }

    sections.push({
      start: r3(start),
      end: r3(end),
      headline: String(scene.overlay || dg.headline || scene.title || ""),
      accent: String(dg.accent || ""),
      badge: String(dg.badge || ""),
      badgeColor: DG_BADGE_COLORS[dg.badgeColor] || DG_BADGE_COLORS.grey,
      groundY: GROUND_Y,
      ...resolved[i],
      card,
      dataCards: bedah ? bedahDataCards(dg) : [],
      closing: bedah ? false : i === scenes.length - 1 && scenes.length > 1,
      captions,
    });
    t += dur;
  });

  const [fw, fh] = DG_DIMS[project.aspect] || DG_DIMS["9:16"];
  const draft = kind === "draft";
  const dgCfg = project.diagram || {};
  const dark = dgCfg.theme === "dark";
  const manifest = {
    version: 1,
    mode: bedah ? "bedah" : "akumulasi",
    width: draft ? fw / 2 : fw,
    height: draft ? fh / 2 : fh,
    fps: draft ? 24 : 30,
    crf: draft ? 26 : 20,
    bg: dark ? "#151A1F" : "#FAF6EF",
    dark,
    accent: /^#[0-9a-fA-F]{6}$/.test(dgCfg.accent || "") ? dgCfg.accent : "#E4572E",
    watermark: String(dgCfg.watermark || ""),
    narration: "narration.wav",
    ...(draft ? { maxSeconds: 20 } : {}),
    sections,
  };
  fs.writeFileSync(path.join(workDir, "project.json"), JSON.stringify(manifest, null, 2));
  return { workDir, total: voiceTotal + LEAD + TAIL };
}

// kind: "draft" (first 20s, half size) | "final". Returns { file, duration }.
export async function renderDiagram(project, kind, onMessage) {
  const log = onMessage || (() => {});
  const dir = projectDir(project.id);
  const { workDir } = buildDiagramWork(project, kind);
  const out = path.join(workDir, kind === "draft" ? "draft.mp4" : "film.mp4");
  log(kind === "draft" ? "Merender pratinjau Diagram (20 detik pertama)..." : "Merender film Diagram penuh...");
  try {
    await execFileP("node", [RENDERER, path.join(workDir, "project.json"), out], {
      cwd: STICKMAN_RUNTIME,
      timeout: 1000 * 60 * 30,
      maxBuffer: 1024 * 1024 * 32,
    });
  } catch (e) {
    const tail = String(e.stderr || e.stdout || e.message || e).slice(-700);
    throw new Error(`Renderer Diagram gagal: ${tail}`);
  }
  const rel = `renders/${kind}.mp4`;
  fs.copyFileSync(out, path.join(dir, rel));
  return { file: rel, duration: probeDuration(out) };
}
