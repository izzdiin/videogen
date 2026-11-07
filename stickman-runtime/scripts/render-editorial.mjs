// Editorial renderer for Videogen (fifth engine).
//
// Draws a motion-graphics editorial format on canvas: warm cream paper, a
// dotted "+" grid and hairline rules, ONE hero object image per shot with a
// slow push-in and feathered edges, a huge condensed uppercase headline with
// one italic-serif accent word and a small accent label pill, hard cuts, no
// captions, and a white fade-out over the final shot. Frames are piped as
// raw RGBA into ffmpeg together with the narration track.
//
// Usage: node render-editorial.mjs <manifest.json> <out.mp4>
// Manifest: { width, height, fps, crf, bg, accent, watermark, narration,
//             maxSeconds?, shots: [{ start, end, headline, accentWord,
//             label, image }] }

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";

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
GlobalFonts.registerFromPath(fontPath("BarlowCondensed-700.ttf"), "CondB");
GlobalFonts.registerFromPath(fontPath("BarlowCondensed-600.ttf"), "CondS");
GlobalFonts.registerFromPath(fontPath("PlayfairDisplay-700Italic.ttf"), "SerifI");
GlobalFonts.registerFromPath(fontPath("PlayfairDisplay-600Italic.ttf"), "SerifI6");
GlobalFonts.registerFromPath(fontPath("Inter-Bold.ttf"), "InterB");
GlobalFonts.registerFromPath(fontPath("Inter-Medium-static.ttf"), "InterM");

const [manifestPath, outPath] = process.argv.slice(2);
if (!manifestPath || !outPath) {
  console.error("usage: node render-editorial.mjs <manifest.json> <out.mp4>");
  process.exit(2);
}
const M = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const W = M.width, H = M.height, FPS = M.fps || 30;
const TOTAL = Math.min(M.maxSeconds || Infinity, M.shots.length ? M.shots[M.shots.length - 1].end : 0);

const PLANES = { p: [720, 1280], s: [960, 960], l: [1280, 720] };
const planeKind = W === H ? "s" : W > H ? "l" : "p";
const [DW, DH] = PLANES[planeKind];
const S = DH / 1280;
const SX = W / DW;
const SY = H / DH;

const PAPER = M.bg || "#F2EDE3";
const INK = "#201D1A";
const ACCENT = M.accent || "#E94F1E";
const FAINT = "rgba(32,29,26,0.55)";

const IMGS = new Array(M.shots.length).fill(null);

function clamp01(v) { return Math.min(1, Math.max(0, v)); }
function smooth(p) { return p * p * (3 - 2 * p); }

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapWords(ctx, text, maxW) {
  const words = String(text || "").split(/\s+/).filter(Boolean).map((w) => ({ w, width: ctx.measureText(w).width }));
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
  return { lines, space };
}

function drawDecor(ctx) {
  // Dotted "+" grid (blueprint feel), sparse.
  ctx.save();
  ctx.strokeStyle = "rgba(32,29,26,0.16)";
  ctx.lineWidth = 2;
  const step = 92, arm = 7;
  for (let gx = step / 2; gx < DW; gx += step) {
    for (let gy = step / 2; gy < DH; gy += step) {
      ctx.beginPath();
      ctx.moveTo(gx - arm, gy); ctx.lineTo(gx + arm, gy);
      ctx.moveTo(gx, gy - arm); ctx.lineTo(gx, gy + arm);
      ctx.stroke();
    }
  }
  // Two faint diagonal rules.
  ctx.strokeStyle = "rgba(32,29,26,0.08)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-40, DH * 0.30); ctx.lineTo(DW + 40, DH * 0.16); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-40, DH * 0.94); ctx.lineTo(DW + 40, DH * 0.80); ctx.stroke();
  ctx.restore();
}

function drawHero(ctx, img, shot, t, x, y, w, h) {
  if (!img) return;
  // Slow push-in, quantised to the 0.25s bucket grid.
  const dur = Math.max(0.1, shot.end - shot.start);
  const tb = Math.floor(t * 4) / 4;
  const p = clamp01((tb - shot.start) / dur);
  const zoom = 1 + 0.09 * smooth(p);
  const fadeIn = clamp01((t - shot.start) / 0.3);
  ctx.save();
  ctx.globalAlpha = fadeIn;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const scale = Math.max(w / img.width, h / img.height) * zoom;
  const w2 = img.width * scale, h2 = img.height * scale;
  ctx.drawImage(img, x + (w - w2) / 2, y + (h - h2) / 2, w2, h2);
  ctx.restore();
  // Feather the plate edges into the paper.
  const f = Math.min(46, h * 0.12, w * 0.12);
  const feather = (x0, y0, x1, y1) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, PAPER);
    g.addColorStop(1, "rgba(242,237,227,0)");
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(x0, x1) - 1, Math.min(y0, y1) - 1, Math.abs(x1 - x0) + 2, Math.abs(y1 - y0) + 2);
  };
  ctx.save();
  ctx.globalAlpha = fadeIn;
  feather(x, y, x + f, y); ctx.fillRect(x, y, f, h);
  feather(x + w, y, x + w - f, y); ctx.fillRect(x + w - f, y, f, h);
  feather(x, y, x, y + f); ctx.fillRect(x, y, w, f);
  feather(x, y + h, x, y + h - f); ctx.fillRect(x, y + h - f, w, f);
  ctx.strokeStyle = "rgba(32,29,26,0.20)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawFrame(t) {
  const canvas = drawFrame.canvas || (drawFrame.canvas = createCanvas(W, H));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(SX, 0, 0, SY, 0, 0);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, DW, DH);
  drawDecor(ctx);

  const idx = M.shots.findIndex((s) => t >= s.start && t < s.end);
  const shot = idx >= 0 ? M.shots[idx] : M.shots[M.shots.length - 1];
  if (!shot) return canvas;
  const shotIdx = idx >= 0 ? idx : M.shots.length - 1;

  const margin = 46;
  const enter = clamp01((t - shot.start) / 0.45);
  const yOff = (1 - smooth(enter)) * 20;

  // Label pill
  let cursorY = DH * 0.048 + yOff;
  const label = String(shot.label || "").toUpperCase();
  if (label) {
    ctx.font = `23px InterB`;
    const lw = ctx.measureText(label).width + 34;
    const lh = 42;
    ctx.save();
    ctx.globalAlpha = enter;
    rr(ctx, margin, cursorY, lw, lh, 8);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.textBaseline = "middle";
    ctx.fillText(label, margin + 17, cursorY + lh / 2 + 1);
    ctx.restore();
    cursorY += lh + DH * 0.028;
  } else {
    cursorY += DH * 0.012;
  }

  // Headline (condensed, huge; a single over-wide word is allowed to crop
  // off the right edge, like the reference).
  const headline = String(shot.headline || "").toUpperCase();
  let headlineBottom = cursorY;
  if (headline) {
    let size = Math.round(DH * 0.092);
    const maxW = DW - margin * 2;
    let wrap;
    for (;;) {
      ctx.font = `${size}px CondB`;
      wrap = wrapWords(ctx, headline, maxW);
      const widestWord = Math.max(...headline.split(/\s+/).map((w) => ctx.measureText(w).width));
      if ((wrap.lines.length <= 2 && widestWord <= maxW + size * 1.5) || size <= 56) break;
      size -= 6;
    }
    ctx.save();
    ctx.globalAlpha = enter;
    ctx.fillStyle = INK;
    ctx.textBaseline = "alphabetic";
    const lineH = size * 0.98;
    wrap.lines.slice(0, 2).forEach((ln, li) => {
      let x = margin;
      const baseY = cursorY + size * 0.86 + li * lineH;
      for (const o of ln) {
        ctx.fillText(o.w, x, baseY);
        x += o.width + wrap.space;
      }
    });
    headlineBottom = cursorY + size * 0.86 + (Math.min(2, wrap.lines.length) - 1) * lineH + size * 0.14;
    ctx.restore();
  }

  // Accent word (italic serif, accent colour), right-aligned under headline.
  const accentWord = String(shot.accentWord || "");
  if (accentWord) {
    let size = Math.round(DH * 0.044);
    ctx.font = `${size}px SerifI`;
    while (ctx.measureText(accentWord).width > DW * 0.62 && size > 26) {
      size -= 3; ctx.font = `${size}px SerifI`;
    }
    ctx.save();
    ctx.globalAlpha = enter;
    ctx.fillStyle = ACCENT;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(accentWord, DW - margin, headlineBottom + size * 1.06);
    ctx.textAlign = "left";
    ctx.restore();
    headlineBottom += size * 1.25;
  }

  // Hero image plate
  const imgTop = Math.max(headlineBottom + DH * 0.03, DH * (planeKind === "l" ? 0.40 : 0.345));
  const imgBottom = DH * 0.90;
  if (imgBottom > imgTop + 80) {
    drawHero(ctx, IMGS[shotIdx], shot, t, margin, imgTop, DW - margin * 2, imgBottom - imgTop);
  }

  // Watermark
  if (M.watermark) {
    ctx.font = `23px InterM`;
    ctx.fillStyle = FAINT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(M.watermark), DW / 2, DH - 38 * S - 6);
    ctx.textAlign = "left";
  }

  // White fade-out over the final shot.
  const isLast = shotIdx === M.shots.length - 1;
  if (isLast && t > shot.end - 0.7) {
    const a = clamp01((t - (shot.end - 0.7)) / 0.7) * 0.97;
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    ctx.fillRect(0, 0, DW, DH);
  }
  return canvas;
}

async function main() {
  for (let i = 0; i < M.shots.length; i++) {
    const p = M.shots[i].image;
    if (p && fs.existsSync(p)) {
      try { IMGS[i] = await loadImage(p); } catch { IMGS[i] = null; }
    }
  }
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
    const idx = M.shots.findIndex((s) => t >= s.start && t < s.end);
    const shot = idx >= 0 ? M.shots[idx] : M.shots[M.shots.length - 1];
    const entering = shot && t - shot.start < 0.5;
    const fading = shot && idx === M.shots.length - 1 && t > shot.end - 0.75;
    const sig = entering || fading ? `x${f}` : `${idx}|${Math.floor(t * 4)}`;
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
  console.log(`editorial render ok: ${outPath} (${TOTAL.toFixed(2)}s, ${frames} frames)`);
}

main().catch((e) => {
  console.error(String(e.stack || e));
  process.exit(1);
});
