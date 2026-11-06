// Dark Card renderer for Videogen (third engine).
//
// Draws a dark "UI card" explainer format on canvas: navy background, a label
// chip + mono title header, a cumulative stack of icon cards with side notes,
// a large caption line with one highlighted phrase, and a user watermark.
// Everything is vector-drawn (no image assets); frames are piped as raw RGBA
// into ffmpeg together with the narration track.
//
// Usage: node render-darkcard.mjs <manifest.json> <out.mp4>
// Manifest: { width, height, fps, crf, bg, accent, watermark, narration,
//             maxSeconds?, shots: [{ start, end, chip, kind, title,
//             cards: [{icon,label,note,isNew}], captions: [{start,end,text,highlight}] }] }

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const FONT_DIRS = [
  path.join(SCRIPT_DIR, "..", "assets", "fonts"),
  path.join(SCRIPT_DIR, "..", "..", "public", "fonts"),
];
function fontPath(name) {
  for (const d of FONT_DIRS) {
    const p = path.join(d, name);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Font tidak ditemukan: ${name}`);
}
GlobalFonts.registerFromPath(fontPath("Inter-ExtraBold-static.ttf"), "InterX");
GlobalFonts.registerFromPath(fontPath("Inter-Bold.ttf"), "InterB");
GlobalFonts.registerFromPath(fontPath("Inter-Medium-static.ttf"), "InterM");
GlobalFonts.registerFromPath(fontPath("DejaVuSansMono.ttf"), "Mono");
GlobalFonts.registerFromPath(fontPath("DejaVuSansMono-Bold.ttf"), "MonoB");

const [manifestPath, outPath] = process.argv.slice(2);
if (!manifestPath || !outPath) {
  console.error("usage: node render-darkcard.mjs <manifest.json> <out.mp4>");
  process.exit(2);
}
const M = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const W = M.width, H = M.height, FPS = M.fps || 30;
const TOTAL = Math.min(M.maxSeconds || Infinity, M.shots.length ? M.shots[M.shots.length - 1].end : 0);

// Design plane: portrait units are canonical (720x1280); other aspects scale.
const ASPECT_KEY = `${W}x${H}`;
const PLANES = { p: [720, 1280], s: [960, 960], l: [1280, 720] };
const planeKind = W === H ? "s" : W > H ? "l" : "p";
const [DW, DH] = PLANES[planeKind];
const S = DH / 1280; // global size scale vs portrait design
const SX = W / DW; // design -> device scale (uniform-ish; use per-axis below)
const SY = H / DH;

const COL = {
  bg: M.bg || "#0A1128",
  cardFill: "#0D1734",
  cardStroke: "#24365F",
  tileFill: "#1B2A52",
  icon: "#DCE6FF",
  note: "#8FA3C8",
  title: "#FFD84D",
  result: "#35C26E",
  white: "#F4F7FF",
  wm: "#93A5CC",
};
const ACCENT = M.accent || "#F26D8D";

function lum(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
const onAccent = lum(ACCENT) > 0.55 ? "#0A1128" : "#FFFFFF";

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }

// Stroke icons drawn inside a box centered at (cx, cy) with size s (design px).
const ICONS = {
  file(ctx, cx, cy, s) {
    const u = s / 48, x = cx - 11 * u, y = cy - 14 * u, w = 22 * u, h = 28 * u;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w - 7 * u, y); ctx.lineTo(x + w, y + 7 * u); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.stroke();
    line(ctx, x + w - 7 * u, y, x + w - 7 * u, y + 7 * u); line(ctx, x + w - 7 * u, y + 7 * u, x + w, y + 7 * u);
    line(ctx, x + 5 * u, y + 15 * u, x + 17 * u, y + 15 * u); line(ctx, x + 5 * u, y + 21 * u, x + 17 * u, y + 21 * u);
  },
  database(ctx, cx, cy, s) {
    const u = s / 48, rx = 13 * u, ry = 5.5 * u;
    ctx.beginPath(); ctx.ellipse(cx, cy - 10 * u, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    line(ctx, cx - rx, cy - 10 * u, cx - rx, cy + 10 * u); line(ctx, cx + rx, cy - 10 * u, cx + rx, cy + 10 * u);
    ctx.beginPath(); ctx.ellipse(cx, cy + 10 * u, rx, ry, 0, Math.PI, 0, true); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true); ctx.stroke();
  },
  key(ctx, cx, cy, s) {
    const u = s / 48;
    circ(ctx, cx - 7 * u, cy - 7 * u, 8 * u);
    line(ctx, cx - 1.5 * u, cy - 1.5 * u, cx + 13 * u, cy + 13 * u);
    line(ctx, cx + 7 * u, cy + 13 * u, cx + 13 * u, cy + 7 * u);
    line(ctx, cx + 10 * u, cy + 10 * u, cx + 15 * u, cy + 15 * u);
  },
  shield(ctx, cx, cy, s) {
    const u = s / 48;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 14 * u);
    ctx.quadraticCurveTo(cx + 12 * u, cy - 11 * u, cx + 12 * u, cy - 10 * u);
    ctx.quadraticCurveTo(cx + 12 * u, cy + 6 * u, cx, cy + 14 * u);
    ctx.quadraticCurveTo(cx - 12 * u, cy + 6 * u, cx - 12 * u, cy - 10 * u);
    ctx.quadraticCurveTo(cx - 12 * u, cy - 11 * u, cx, cy - 14 * u);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 6 * u, cy); ctx.lineTo(cx - 2 * u, cy + 4.5 * u); ctx.lineTo(cx + 6.5 * u, cy - 5 * u); ctx.stroke();
  },
  check(ctx, cx, cy, s) {
    const u = s / 48;
    circ(ctx, cx, cy, 13 * u);
    ctx.beginPath(); ctx.moveTo(cx - 7 * u, cy); ctx.lineTo(cx - 2 * u, cy + 5 * u); ctx.lineTo(cx + 8 * u, cy - 6 * u); ctx.stroke();
  },
  book(ctx, cx, cy, s) {
    const u = s / 48;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10 * u);
    ctx.quadraticCurveTo(cx - 8 * u, cy - 15 * u, cx - 14 * u, cy - 12 * u);
    ctx.lineTo(cx - 14 * u, cy + 11 * u);
    ctx.quadraticCurveTo(cx - 8 * u, cy + 8 * u, cx, cy + 12 * u);
    ctx.quadraticCurveTo(cx + 8 * u, cy + 8 * u, cx + 14 * u, cy + 11 * u);
    ctx.lineTo(cx + 14 * u, cy - 12 * u);
    ctx.quadraticCurveTo(cx + 8 * u, cy - 15 * u, cx, cy - 10 * u);
    ctx.stroke();
    line(ctx, cx, cy - 10 * u, cx, cy + 12 * u);
  },
  globe(ctx, cx, cy, s) {
    const u = s / 48;
    circ(ctx, cx, cy, 13 * u);
    ctx.beginPath(); ctx.ellipse(cx, cy, 6 * u, 13 * u, 0, 0, Math.PI * 2); ctx.stroke();
    line(ctx, cx - 13 * u, cy, cx + 13 * u, cy);
  },
  bell(ctx, cx, cy, s) {
    const u = s / 48;
    ctx.beginPath();
    ctx.moveTo(cx - 10 * u, cy + 8 * u);
    ctx.quadraticCurveTo(cx - 10 * u, cy - 8 * u, cx, cy - 11 * u);
    ctx.quadraticCurveTo(cx + 10 * u, cy - 8 * u, cx + 10 * u, cy + 8 * u);
    ctx.closePath(); ctx.stroke();
    line(ctx, cx - 13 * u, cy + 8 * u, cx + 13 * u, cy + 8 * u);
    ctx.beginPath(); ctx.arc(cx, cy + 12 * u, 3 * u, 0, Math.PI * 2); ctx.stroke();
  },
  gear(ctx, cx, cy, s) {
    const u = s / 48;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      line(ctx, cx + Math.cos(a) * 8.5 * u, cy + Math.sin(a) * 8.5 * u, cx + Math.cos(a) * 13.5 * u, cy + Math.sin(a) * 13.5 * u);
    }
    circ(ctx, cx, cy, 9 * u); circ(ctx, cx, cy, 3.5 * u);
  },
  lock(ctx, cx, cy, s) {
    const u = s / 48;
    rr(ctx, cx - 11 * u, cy - 2 * u, 22 * u, 16 * u, 3 * u); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy - 2 * u, 7.5 * u, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy + 5 * u, 2.2 * u, 0, Math.PI * 2); ctx.fill();
  },
  chart(ctx, cx, cy, s) {
    const u = s / 48;
    line(ctx, cx - 13 * u, cy - 13 * u, cx - 13 * u, cy + 13 * u);
    line(ctx, cx - 13 * u, cy + 13 * u, cx + 14 * u, cy + 13 * u);
    line(ctx, cx - 7 * u, cy + 13 * u, cx - 7 * u, cy + 3 * u);
    line(ctx, cx, cy + 13 * u, cx, cy - 4 * u);
    line(ctx, cx + 7 * u, cy + 13 * u, cx + 7 * u, cy - 10 * u);
  },
  clock(ctx, cx, cy, s) {
    const u = s / 48;
    circ(ctx, cx, cy, 13 * u);
    line(ctx, cx, cy, cx, cy - 8 * u); line(ctx, cx, cy, cx + 6 * u, cy + 3 * u);
  },
  folder(ctx, cx, cy, s) {
    const u = s / 48;
    ctx.beginPath();
    ctx.moveTo(cx - 14 * u, cy - 9 * u); ctx.lineTo(cx - 4 * u, cy - 9 * u); ctx.lineTo(cx - 1 * u, cy - 5 * u); ctx.lineTo(cx + 14 * u, cy - 5 * u);
    ctx.lineTo(cx + 14 * u, cy + 11 * u); ctx.lineTo(cx - 14 * u, cy + 11 * u); ctx.closePath(); ctx.stroke();
  },
  zap(ctx, cx, cy, s) {
    const u = s / 48;
    ctx.beginPath();
    ctx.moveTo(cx + 3 * u, cy - 14 * u); ctx.lineTo(cx - 8 * u, cy + 2 * u); ctx.lineTo(cx - 1 * u, cy + 2 * u);
    ctx.lineTo(cx - 3 * u, cy + 14 * u); ctx.lineTo(cx + 8 * u, cy - 2 * u); ctx.lineTo(cx + 1 * u, cy - 2 * u);
    ctx.closePath(); ctx.stroke();
  },
  layers(ctx, cx, cy, s) {
    const u = s / 48;
    for (const dy of [-8, 0, 8]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + (dy - 6) * u); ctx.lineTo(cx + 13 * u, cy + dy * u); ctx.lineTo(cx, cy + (dy + 6) * u); ctx.lineTo(cx - 13 * u, cy + dy * u);
      ctx.closePath(); ctx.stroke();
    }
  },
  code(ctx, cx, cy, s) {
    const u = s / 48;
    ctx.beginPath(); ctx.moveTo(cx - 3 * u, cy - 11 * u); ctx.lineTo(cx - 13 * u, cy); ctx.lineTo(cx - 3 * u, cy + 11 * u); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 3 * u, cy - 11 * u); ctx.lineTo(cx + 13 * u, cy); ctx.lineTo(cx + 3 * u, cy + 11 * u); ctx.stroke();
  },
};

function drawCard(ctx, card, x, y, w, h, alpha, newest) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (newest) {
    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = 22 * S;
  }
  rr(ctx, x, y, w, h, 18 * S);
  ctx.fillStyle = COL.cardFill;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = newest ? 3.2 * S : 2 * S;
  ctx.strokeStyle = newest ? ACCENT : COL.cardStroke;
  ctx.stroke();

  const tile = h * 0.62;
  const tx = x + 18 * S, ty = y + (h - tile) / 2;
  rr(ctx, tx, ty, tile, tile, 12 * S);
  ctx.fillStyle = COL.tileFill;
  ctx.fill();

  const draw = ICONS[card.icon] || ICONS.file;
  ctx.strokeStyle = COL.icon;
  ctx.fillStyle = COL.icon;
  ctx.lineWidth = Math.max(1.6, tile * 0.055);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  draw(ctx, tx + tile / 2, ty + tile / 2, tile * 0.92);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha;
  const label = card.label || "";
  const labelX = tx + tile + 18 * S;
  const maxLabelW = x + w - 14 * S - labelX;
  let ls = h * 0.34;
  ctx.font = `${Math.round(ls)}px InterB`;
  while (ctx.measureText(label).width > maxLabelW && ls > h * 0.19) {
    ls -= 1.5;
    ctx.font = `${Math.round(ls)}px InterB`;
  }
  ctx.fillStyle = COL.white;
  ctx.textBaseline = "middle";
  ctx.fillText(label, labelX, y + h / 2 + 1);
  ctx.restore();
}

function wrapCaption(ctx, text, maxW) {
  const words = String(text || "").split(/\s+/).filter(Boolean).map((w) => ({ w, width: 0 }));
  for (const o of words) o.width = ctx.measureText(o.w).width;
  const space = ctx.measureText(" ").width;
  const lines = [];
  let cur = [], curW = 0;
  for (const o of words) {
    const add = (cur.length ? space : 0) + o.width;
    if (cur.length && curW + add > maxW) { lines.push(cur); cur = []; curW = 0; }
    if (cur.length) curW += space;
    cur.push(o); curW += o.width;
  }
  if (cur.length) lines.push(cur);
  return { lines: lines.slice(0, 2), space };
}

function drawCaption(ctx, cue, areaY) {
  const size = 47 * S;
  ctx.font = `${Math.round(size)}px InterX`;
  const maxW = DW - 96 * S;
  const { lines, space } = wrapCaption(ctx, cue.text, maxW);
  // locate highlight word span (contiguous normalized match)
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim();
  const hlWords = norm(cue.highlight || "").split(/\s+/).filter(Boolean);
  const flat = [];
  lines.forEach((ln, li) => ln.forEach((o) => flat.push({ o, li })));
  if (hlWords.length) {
    const seq = flat.map((f) => norm(f.o.w));
    outer: for (let i = 0; i + hlWords.length <= seq.length; i++) {
      for (let j = 0; j < hlWords.length; j++) if (seq[i + j] !== hlWords[j]) continue outer;
      for (let j = 0; j < hlWords.length; j++) flat[i + j].o.hl = true;
      break;
    }
  }
  const lineH = size * 1.28;
  lines.forEach((ln, li) => {
    const totalW = ln.reduce((a, o) => a + o.width, 0) + space * (ln.length - 1);
    let x = (DW - totalW) / 2;
    const yMid = areaY + li * lineH + lineH / 2;
    // highlight pill for each contiguous run on this line
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const x1 = run[0].x - 9 * S, x2 = run[run.length - 1].x + run[run.length - 1].o.width + 9 * S;
      rr(ctx, x1, yMid - size * 0.62, x2 - x1, size * 1.24, 10 * S);
      ctx.fillStyle = ACCENT;
      ctx.fill();
      run = [];
    };
    const placed = ln.map((o) => { const p = { o, x }; x += o.width + space; return p; });
    for (const p of placed) { if (p.o.hl) run.push(p); else flush(); }
    flush();
    ctx.textBaseline = "middle";
    for (const p of placed) {
      ctx.fillStyle = p.o.hl ? onAccent : COL.white;
      ctx.fillText(p.o.w, p.x, yMid + 1);
    }
    for (const p of placed) delete p.o.hl;
  });
}

function drawFrame(t) {
  const canvas = drawFrame.canvas || (drawFrame.canvas = createCanvas(W, H));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(SX, 0, 0, SY, 0, 0);
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, DW, DH);

  const shot = M.shots.find((s) => t >= s.start && t < s.end) || M.shots[M.shots.length - 1];
  if (!shot) return canvas;

  // Layout: card stack geometry first (header aligns to the stack's left edge).
  const cards = shot.cards || [];
  const twoCol = planeKind === "l" && cards.length > 4;
  const cols = twoCol ? 2 : 1;
  const rows = Math.max(1, Math.ceil(cards.length / cols));
  const noteW = twoCol ? 0 : planeKind === "p" ? 168 : planeKind === "s" ? 180 : 210;
  let stackW;
  if (planeKind === "p") stackW = DW - 96;
  else if (twoCol) stackW = DW - 96;
  else if (planeKind === "s") stackW = Math.min(DW - 96, 720);
  else stackW = 860;
  const stackX = (DW - stackW) / 2;
  const colGap = 28;
  const cardW = twoCol ? (stackW - colGap) / 2 : stackW - noteW - 14;

  // Header: chip + title
  const marginX = stackX;
  const hy = planeKind === "l" ? 44 : 72 * S + 24;
  const chipText = String(shot.chip || "").toUpperCase();
  const chipH = 54 * S;
  ctx.font = `${Math.round(29 * S)}px MonoB`;
  const chipW = chipText ? ctx.measureText(chipText).width + 38 * S : 0;
  if (chipText) {
    rr(ctx, marginX, hy, chipW, chipH, 10 * S);
    ctx.fillStyle = shot.kind === "result" ? COL.result : ACCENT;
    ctx.fill();
    ctx.fillStyle = shot.kind === "result" ? "#06281A" : onAccent;
    ctx.textBaseline = "middle";
    ctx.fillText(chipText, marginX + 19 * S, hy + chipH / 2 + 1);
  }
  const title = String(shot.title || "").toUpperCase();
  if (title) {
    let ts = 41 * S;
    const tx = marginX + (chipText ? chipW + 20 * S : 0);
    ctx.font = `${Math.round(ts)}px MonoB`;
    while (ctx.measureText(title).width > DW - tx - marginX && ts > 18) {
      ts -= 2; ctx.font = `${Math.round(ts)}px MonoB`;
    }
    ctx.fillStyle = COL.title;
    ctx.textBaseline = "middle";
    ctx.fillText(title, tx, hy + chipH / 2 + 1);
  }

  // Cards
  const headerBottom = hy + chipH + 34 * S;
  const captionTop = DH - (planeKind === "l" ? 128 : 196) * S - (M.watermark ? 40 * S : 0);
  if (cards.length) {
    const gap = 16 * S;
    const availH = captionTop - 26 * S - headerBottom;
    let cardH = Math.min(94 * S, (availH - (rows - 1) * gap) / rows);
    cardH = Math.max(52 * S, cardH);
    const x0 = stackX;
    cards.forEach((card, i) => {
      const col = twoCol ? Math.floor(i / rows) : 0;
      const row = twoCol ? i % rows : i;
      const cx = x0 + col * (cardW + colGap);
      const cy = headerBottom + row * (cardH + gap);
      let alpha = 1, yOff = 0;
      if (card.isNew) {
        const p = Math.min(1, Math.max(0, (t - shot.start) / 0.45));
        alpha = p; yOff = (1 - p) * -16 * S;
      }
      drawCard(ctx, card, cx, cy + yOff, cardW, cardH, alpha, Boolean(card.isNew));
      if (!twoCol && card.note) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `${Math.round(planeKind === "p" ? 20 : 22)}px Mono`;
        ctx.fillStyle = COL.note;
        ctx.textBaseline = "middle";
        const words = String(card.note).toUpperCase().split(/\s+/);
        const linesN = [];
        let cur = "";
        for (const w of words) {
          const trial = cur ? cur + " " + w : w;
          if (ctx.measureText(trial).width > noteW && cur) { linesN.push(cur); cur = w; } else cur = trial;
        }
        if (cur) linesN.push(cur);
        linesN.slice(0, 2).forEach((ln, li) => {
          ctx.fillText(ln, cx + cardW + 14, cy + yOff + cardH / 2 + (li - (Math.min(2, linesN.length) - 1) / 2) * (planeKind === "p" ? 24 : 27));
        });
        ctx.restore();
      }
    });
  }

  // Caption
  const cue = (shot.captions || []).find((c) => t >= c.start && t < c.end);
  if (cue) drawCaption(ctx, cue, captionTop);

  // Watermark
  if (M.watermark) {
    ctx.font = `${Math.round(25 * S)}px Mono`;
    ctx.fillStyle = COL.wm;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(M.watermark), DW / 2, DH - 40 * S);
    ctx.textAlign = "left";
  }
  return canvas;
}

async function main() {
  const canvas = createCanvas(W, H);
  drawFrame.canvas = canvas;
  const narrationAbs = path.join(path.dirname(manifestPath), M.narration || "narration.wav");
  const ff = spawn("ffmpeg", [
    "-v", "error", "-y",
    "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${W}x${H}`, "-framerate", String(FPS),
    "-i", "pipe:0", "-i", narrationAbs,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", String(M.crf || 20), "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
    "-t", TOTAL.toFixed(3), outPath,
  ], { stdio: ["pipe", "ignore", "pipe"] });
  let ffErr = "";
  ff.stderr.on("data", (d) => (ffErr += d.toString()));
  const done = new Promise((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${ffErr.slice(-500)}`))));
  });

  const frames = Math.round(TOTAL * FPS);
  let lastSig = "", lastBuf = null;
  for (let f = 0; f < frames; f++) {
    const t = f / FPS;
    const shot = M.shots.find((s) => t >= s.start && t < s.end);
    const cue = shot ? (shot.captions || []).findIndex((c) => t >= c.start && t < c.end) : -1;
    const entering = shot && (shot.cards || []).some((c) => c.isNew) && t - shot.start < 0.5;
    const sig = entering ? `e${f}` : `${M.shots.indexOf(shot)}|${cue}`;
    let buf;
    if (sig === lastSig && lastBuf) {
      buf = lastBuf;
    } else {
      const cv = drawFrame(t);
      buf = Buffer.from(cv.getContext("2d").getImageData(0, 0, W, H).data);
      lastSig = sig; lastBuf = buf;
    }
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await done;
  console.log(`darkcard render ok: ${outPath} (${TOTAL.toFixed(2)}s, ${frames} frames)`);
}

main().catch((e) => {
  console.error(String(e.stack || e));
  process.exit(1);
});
