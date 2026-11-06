// Diagram renderer for Videogen (fourth engine).
//
// Draws a "diagram explainer" format on canvas: one flat-vector diagram on a
// warm cream canvas, built up section by section (components pop in, cables
// draw themselves between them), a virtual camera that pans/zooms across the
// diagram, a bold headline per section with one accent-coloured keyword, a
// status pill, karaoke phrase captions (black pill bar, one yellow-highlighted
// keyword), and a user watermark. No image assets; all vector-drawn. Frames
// are piped as raw RGBA into ffmpeg together with the narration track.
//
// Usage: node render-diagram.mjs <manifest.json> <out.mp4>
// Manifest: { width, height, fps, crf, bg, accent, watermark, narration,
//             maxSeconds?, sections: [{ start, end, headline, accent, badge,
//             badgeColor, groundY, worldW, camTo: {cx, w},
//             components: [{id, comp, label, x, h, isNew}],
//             cables: [{x1, y1, x2, y2, color, isNew}],
//             tracker: {subject, steps: [{label, state, fresh}]},
//             card: {title, lines[]} | null, closing: bool,
//             captions: [{start, end, text, highlight}] }] }
//
// Fase 2: square packets travel along cables, a step checklist tracker sits
// under the headline, an optional black terminal data card pops in per
// section, ambient details blink (server LEDs, BTS beacon, monitor dot),
// and the closing section hides all HUD except captions + watermark.
// Packet/ambient motion is quantised to the frame cache's 0.25s signature
// buckets so the render stays fast on weak hardware.

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
  console.error("usage: node render-diagram.mjs <manifest.json> <out.mp4>");
  process.exit(2);
}
const M = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const W = M.width, H = M.height, FPS = M.fps || 30;
const SECTIONS = M.sections || [];
const TOTAL = Math.min(M.maxSeconds || Infinity, SECTIONS.length ? SECTIONS[SECTIONS.length - 1].end : 0);

const PLANES = { p: [720, 1280], s: [960, 960], l: [1280, 720] };
const planeKind = W === H ? "s" : W > H ? "l" : "p";
const [DW, DH] = PLANES[planeKind];
const S = DH / 1280;
const SX = W / DW;
const SY = H / DH;

const DARK = !!M.dark;
const INK = DARK ? "#E9EDF1" : "#23272E";
const PAPER = M.bg || (DARK ? "#151A1F" : "#FAF6EF");
const ACCENT = M.accent || "#E4572E";
const GREY_METAL = "#D9DCE0";
const PALE_BLUE = "#CFE8F7";
const GREEN = "#35C26E";
const GOLD = "#E3A008";
const LABEL = DARK ? "#9AA3AD" : "#7A756C";
const YELLOW = "#FFD21F";
// Component fills are light objects; on the dark theme their outlines come
// from INK (now light), so they read as pale diagrams on a dark canvas.
const PANEL_BLUE = "#35618E";

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
function smooth(p) { return p * p * (3 - 2 * p); }
function clamp01(v) { return Math.min(1, Math.max(0, v)); }

// --- Components (world coordinates; x = centre, gy = ground line) -----------
function wifiArcs(ctx, x, y, t, r0) {
  const pulse = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * 3.2));
  ctx.save();
  ctx.strokeStyle = "#7FB8E8";
  ctx.lineCap = "round";
  for (let k = 0; k < 3; k++) {
    ctx.globalAlpha = pulse * (1 - k * 0.22);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x, y, r0 + k * 17, -Math.PI * 0.78, -Math.PI * 0.22);
    ctx.stroke();
  }
  ctx.restore();
}

const COMP = {
  hp(ctx, x, gy, t) {
    rr(ctx, x - 54, gy - 215, 108, 215, 18); ctx.fillStyle = "#FFFFFF"; ctx.fill(); ctx.stroke();
    rr(ctx, x - 41, gy - 190, 82, 142, 6); ctx.fillStyle = PALE_BLUE; ctx.fill();
    line(ctx, x - 16, gy - 26, x + 16, gy - 26);
    wifiArcs(ctx, x, gy - 218, t, 20);
  },
  bts(ctx, x, gy, t) {
    ctx.beginPath();
    ctx.moveTo(x - 13, gy); ctx.lineTo(x - 5, gy - 405); ctx.lineTo(x + 5, gy - 405); ctx.lineTo(x + 13, gy);
    ctx.closePath(); ctx.fillStyle = GREY_METAL; ctx.fill(); ctx.stroke();
    line(ctx, x - 9, gy - 90, x + 9, gy - 170); line(ctx, x + 9, gy - 90, x - 9, gy - 170);
    line(ctx, x - 8, gy - 200, x + 8, gy - 280); line(ctx, x + 8, gy - 200, x - 8, gy - 280);
    rr(ctx, x - 66, gy - 398, 40, 74, 6); ctx.fillStyle = "#EDEFF2"; ctx.fill(); ctx.stroke();
    rr(ctx, x + 26, gy - 398, 40, 74, 6); ctx.fillStyle = "#EDEFF2"; ctx.fill(); ctx.stroke();
    wifiArcs(ctx, x, gy - 398, t, 14);
    // beacon on the mast tip, blinking on the 0.5s grid
    const on = Math.floor(t * 2) % 2 === 0;
    ctx.beginPath(); ctx.arc(x, gy - 412, 10, 0, Math.PI * 2);
    ctx.fillStyle = on ? "rgba(214,69,65,0.25)" : "rgba(214,69,65,0.05)"; ctx.fill();
    ctx.beginPath(); ctx.arc(x, gy - 412, 5, 0, Math.PI * 2);
    ctx.fillStyle = on ? "#D64541" : "#E8A19E"; ctx.fill();
  },
  server(ctx, x, gy, t) {
    rr(ctx, x - 80, gy - 265, 160, 265, 10); ctx.fillStyle = "#EDEFF2"; ctx.fill(); ctx.stroke();
    for (let k = 0; k < 3; k++) {
      const uy = gy - 265 + 14 + k * 82;
      rr(ctx, x - 64, gy - 265 + 14 + k * 82, 128, 66, 6); ctx.fillStyle = "#3A3F44"; ctx.fill();
      ctx.fillStyle = (Math.floor(t * 2) + k) % 2 === 0 ? GREEN : "#2E7D4F";
      ctx.fillRect(x + 30, uy + 14, 22, 7);
      ctx.beginPath(); ctx.arc(x + 40, uy + 42, 5, 0, Math.PI * 2);
      ctx.fillStyle = (Math.floor(t * 2) + k) % 3 === 0 ? GOLD : GREEN;
      ctx.fill();
      ctx.fillStyle = "#565E66"; ctx.fillRect(x - 52, uy + 14, 58, 7); ctx.fillRect(x - 52, uy + 30, 44, 7);
    }
  },
  monitor(ctx, x, gy, t) {
    rr(ctx, x - 98, gy - 195, 196, 142, 9); ctx.fillStyle = "#FFFFFF"; ctx.fill(); ctx.stroke();
    const pts = [[-74, -92], [-38, -118], [-4, -100], [34, -138], [70, -122]];
    ctx.beginPath();
    ctx.moveTo(x - 74, gy - 92); ctx.lineTo(x - 38, gy - 118); ctx.lineTo(x - 4, gy - 100); ctx.lineTo(x + 34, gy - 138); ctx.lineTo(x + 70, gy - 122);
    ctx.strokeStyle = "#2470C9"; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = INK; ctx.lineWidth = 3;
    // a dot travelling along the graph, stepping on the 0.25s grid
    const u = (Math.floor(t * 4) % 16) / 16 * 4;
    const seg = Math.min(3, Math.floor(u));
    const fu = u - seg;
    const dx = pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * fu;
    const dy = pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * fu;
    ctx.beginPath(); ctx.arc(x + dx, gy + dy, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#2470C9"; ctx.fill();
    ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.moveTo(x - 14, gy - 53); ctx.lineTo(x + 14, gy - 53); ctx.lineTo(x + 26, gy); ctx.lineTo(x - 26, gy);
    ctx.closePath(); ctx.fillStyle = GREY_METAL; ctx.fill(); ctx.stroke();
  },
  router(ctx, x, gy, t) {
    line(ctx, x - 62, gy - 58, x - 78, gy - 95); line(ctx, x + 62, gy - 58, x + 78, gy - 95);
    ctx.beginPath(); ctx.arc(x - 78, gy - 95, 5, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); ctx.arc(x + 78, gy - 95, 5, 0, Math.PI * 2); ctx.fill();
    rr(ctx, x - 98, gy - 60, 196, 60, 13); ctx.fillStyle = "#FFFFFF"; ctx.fill(); ctx.stroke();
    ctx.fillStyle = GREEN;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x - 30 + k * 30, gy - 30, 5, 0, Math.PI * 2); ctx.fill(); }
    wifiArcs(ctx, x, gy - 92, t, 12);
  },
  cloud(ctx, x, gy) {
    const y = gy - 10;
    ctx.beginPath();
    ctx.moveTo(x - 92, y);
    ctx.bezierCurveTo(x - 110, y - 30, x - 92, y - 56, x - 60, y - 60);
    ctx.bezierCurveTo(x - 50, y - 98, x + 8, y - 110, x + 32, y - 78);
    ctx.bezierCurveTo(x + 64, y - 90, x + 98, y - 64, x + 92, y);
    ctx.closePath(); ctx.fillStyle = "#EAF4FC"; ctx.fill();
    ctx.strokeStyle = "#7FB8E8"; ctx.stroke(); ctx.strokeStyle = INK;
  },
  database(ctx, x, gy) {
    ctx.beginPath(); ctx.ellipse(x, gy - 190, 74, 20, 0, 0, Math.PI * 2); ctx.fillStyle = "#EDEFF2"; ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 74, gy - 190); ctx.lineTo(x - 74, gy - 18);
    ctx.beginPath(); ctx.ellipse(x, gy - 18, 74, 20, 0, 0, Math.PI, false); ctx.stroke();
    line(ctx, x + 74, gy - 190, x + 74, gy - 18);
    for (const dy of [-132, -74]) {
      ctx.beginPath(); ctx.ellipse(x, gy + dy, 74, 20, 0, Math.PI * 0.08, Math.PI * 0.92, false); ctx.stroke();
    }
    ctx.fillStyle = GREEN; ctx.fillRect(x - 74, gy - 148, 148, 9);
  },
  orang(ctx, x, gy) {
    ctx.beginPath(); ctx.arc(x, gy - 204, 27, 0, Math.PI * 2); ctx.fillStyle = "#F6C89F"; ctx.fill(); ctx.stroke();
    ctx.lineWidth = 11; ctx.lineCap = "round";
    line(ctx, x, gy - 176, x, gy - 92);
    line(ctx, x, gy - 152, x - 40, gy - 108); line(ctx, x, gy - 152, x + 40, gy - 108);
    line(ctx, x, gy - 92, x - 34, gy); line(ctx, x, gy - 92, x + 34, gy);
    ctx.lineWidth = 3; ctx.lineCap = "butt";
  },
  rumah(ctx, x, gy) {
    ctx.beginPath();
    ctx.moveTo(x - 102, gy - 148); ctx.lineTo(x, gy - 245); ctx.lineTo(x + 102, gy - 148); ctx.closePath();
    ctx.fillStyle = "#E88B7D"; ctx.fill(); ctx.stroke();
    rr(ctx, x - 84, gy - 148, 168, 148, 4); ctx.fillStyle = "#FFFFFF"; ctx.fill(); ctx.stroke();
    rr(ctx, x - 16, gy - 74, 34, 74, 4); ctx.fillStyle = "#8A5A3B"; ctx.fill(); ctx.stroke();
    rr(ctx, x - 62, gy - 122, 36, 36, 4); ctx.fillStyle = PALE_BLUE; ctx.fill(); ctx.stroke();
    rr(ctx, x + 28, gy - 122, 36, 36, 4); ctx.fillStyle = PALE_BLUE; ctx.fill(); ctx.stroke();
  },
  gembok(ctx, x, gy) {
    ctx.beginPath(); ctx.arc(x, gy - 108, 40, Math.PI, 0); ctx.stroke();
    line(ctx, x - 40, gy - 108, x - 40, gy - 84); line(ctx, x + 40, gy - 108, x + 40, gy - 84);
    rr(ctx, x - 60, gy - 112, 120, 112, 14); ctx.fillStyle = GOLD; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, gy - 62, 10, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
    ctx.fillRect(x - 4, gy - 62, 8, 22);
  },
  chat(ctx, x, gy) {
    rr(ctx, x - 88, gy - 155, 176, 118, 24); ctx.fillStyle = "#FFFFFF"; ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 30, gy - 37); ctx.lineTo(x - 12, gy - 4); ctx.lineTo(x + 16, gy - 37); ctx.closePath();
    ctx.fillStyle = "#FFFFFF"; ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#B9BEC6";
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x - 38 + k * 38, gy - 96, 10, 0, Math.PI * 2); ctx.fill(); }
  },
  dokumen(ctx, x, gy) {
    ctx.beginPath();
    ctx.moveTo(x - 62, gy - 215); ctx.lineTo(x + 34, gy - 215); ctx.lineTo(x + 62, gy - 187); ctx.lineTo(x + 62, gy);
    ctx.lineTo(x - 62, gy); ctx.closePath(); ctx.fillStyle = "#FFFFFF"; ctx.fill(); ctx.stroke();
    line(ctx, x + 34, gy - 215, x + 34, gy - 187); line(ctx, x + 34, gy - 187, x + 62, gy - 187);
    ctx.strokeStyle = "#B9BEC6";
    for (let k = 0; k < 4; k++) line(ctx, x - 42, gy - 168 + k * 34, x + 42, gy - 168 + k * 34);
    ctx.strokeStyle = INK;
  },
  kotak(ctx, x, gy) {
    rr(ctx, x - 82, gy - 175, 164, 175, 12); ctx.fillStyle = "#F1EFE9"; ctx.fill(); ctx.stroke();
    rr(ctx, x - 82, gy - 175, 164, 34, 12); ctx.fillStyle = GREY_METAL; ctx.fill();
    line(ctx, x - 82, gy - 141, x + 82, gy - 141);
  },
  "panel-surya"(ctx, x, gy) {
    line(ctx, x, gy - 64, x, gy);
    line(ctx, x - 32, gy, x + 32, gy);
    const A = [x - 102, gy - 118], B = [x + 78, gy - 185], C = [x + 102, gy - 112], D = [x - 78, gy - 45];
    ctx.beginPath();
    ctx.moveTo(...A); ctx.lineTo(...B); ctx.lineTo(...C); ctx.lineTo(...D); ctx.closePath();
    ctx.fillStyle = PANEL_BLUE; ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#CFE8F7"; ctx.lineWidth = 2;
    for (const u of [0.33, 0.66]) {
      line(ctx, A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, D[0] + (C[0] - D[0]) * u, D[1] + (C[1] - D[1]) * u);
    }
    line(ctx, (A[0] + D[0]) / 2, (A[1] + D[1]) / 2, (B[0] + C[0]) / 2, (B[1] + C[1]) / 2);
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
  },
  baterai(ctx, x, gy) {
    rr(ctx, x - 88, gy - 128, 152, 128, 12); ctx.fillStyle = "#FFFFFF"; ctx.fill(); ctx.stroke();
    rr(ctx, x + 64, gy - 94, 22, 60, 6); ctx.fillStyle = GREY_METAL; ctx.fill(); ctx.stroke();
    ctx.fillStyle = GREEN;
    for (let k = 0; k < 3; k++) ctx.fillRect(x - 68 + k * 44, gy - 100, 32, 72);
  },
  bank(ctx, x, gy) {
    ctx.beginPath();
    ctx.moveTo(x - 102, gy - 186); ctx.lineTo(x, gy - 235); ctx.lineTo(x + 102, gy - 186); ctx.closePath();
    ctx.fillStyle = "#EDEFF2"; ctx.fill(); ctx.stroke();
    rr(ctx, x - 102, gy - 186, 204, 26, 3); ctx.fillStyle = "#FFFFFF"; ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#FFFFFF";
    for (const cx of [-84, -30, 24, 78]) { ctx.fillRect(x + cx, gy - 158, 18, 126); ctx.strokeRect(x + cx, gy - 158, 18, 126); }
    rr(ctx, x - 110, gy - 32, 220, 14, 3); ctx.fillStyle = GREY_METAL; ctx.fill(); ctx.stroke();
    rr(ctx, x - 118, gy - 18, 236, 18, 3); ctx.fillStyle = GREY_METAL; ctx.fill(); ctx.stroke();
  },
  globe(ctx, x, gy) {
    ctx.beginPath(); ctx.arc(x, gy - 108, 86, 0, Math.PI * 2); ctx.fillStyle = "#EAF4FC"; ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#7FB8E8"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(x, gy - 108, 38, 86, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, gy - 108, 86, 30, 0, 0, Math.PI * 2); ctx.stroke();
    line(ctx, x - 86, gy - 108, x + 86, gy - 108);
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    line(ctx, x, gy - 22, x, gy);
    line(ctx, x - 30, gy, x + 30, gy);
  },
  satelit(ctx, x, gy) {
    ctx.fillStyle = PANEL_BLUE;
    rr(ctx, x - 122, gy - 142, 80, 48, 4); ctx.fill(); ctx.stroke();
    rr(ctx, x + 42, gy - 142, 80, 48, 4); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#CFE8F7"; ctx.lineWidth = 2;
    for (const px of [-122, 42]) {
      line(ctx, x + px + 27, gy - 142, x + px + 27, gy - 94);
      line(ctx, x + px + 53, gy - 142, x + px + 53, gy - 94);
      line(ctx, x + px, gy - 118, x + px + 80, gy - 118);
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    line(ctx, x - 42, gy - 118, x - 26, gy - 118); line(ctx, x + 26, gy - 118, x + 42, gy - 118);
    rr(ctx, x - 27, gy - 152, 54, 72, 8); ctx.fillStyle = "#EDEFF2"; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, gy - 62, 24, Math.PI * 0.15, Math.PI * 0.85, false); ctx.stroke();
    line(ctx, x, gy - 80, x, gy - 58);
    ctx.beginPath(); ctx.arc(x, gy - 56, 5, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
  },
  mobil(ctx, x, gy) {
    ctx.beginPath();
    ctx.moveTo(x - 58, gy - 60); ctx.lineTo(x - 36, gy - 104); ctx.lineTo(x + 32, gy - 104); ctx.lineTo(x + 58, gy - 60); ctx.closePath();
    ctx.fillStyle = PALE_BLUE; ctx.fill(); ctx.stroke();
    line(ctx, x - 2, gy - 104, x - 2, gy - 60);
    rr(ctx, x - 106, gy - 62, 212, 42, 13); ctx.fillStyle = "#2470C9"; ctx.fill(); ctx.stroke();
    for (const wx of [-62, 62]) {
      ctx.beginPath(); ctx.arc(x + wx, gy - 18, 18, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
      ctx.beginPath(); ctx.arc(x + wx, gy - 18, 8, 0, Math.PI * 2); ctx.fillStyle = GREY_METAL; ctx.fill();
    }
    ctx.fillStyle = GOLD; ctx.fillRect(x + 92, gy - 52, 12, 9);
  },
  lampu(ctx, x, gy, t) {
    ctx.lineWidth = 6;
    line(ctx, x, gy - 228, x, gy);
    ctx.lineWidth = 3;
    line(ctx, x - 26, gy, x + 26, gy);
    ctx.beginPath();
    ctx.moveTo(x, gy - 228); ctx.quadraticCurveTo(x + 4, gy - 248, x + 40, gy - 246);
    ctx.stroke();
    const glow = 0.16 + 0.06 * (0.5 + 0.5 * Math.sin(t * 2.2));
    ctx.beginPath(); ctx.arc(x + 44, gy - 232, 30, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(227,160,8,${glow.toFixed(3)})`; ctx.fill();
    ctx.beginPath(); ctx.arc(x + 44, gy - 232, 13, 0, Math.PI * 2);
    ctx.fillStyle = GOLD; ctx.fill(); ctx.stroke();
    line(ctx, x + 34, gy - 244, x + 44, gy - 245); line(ctx, x + 54, gy - 244, x + 44, gy - 245);
  },
};

function drawWorld(ctx, sec, t, groundScreenY) {
  const prev = SECTIONS[SECTIONS.indexOf(sec) - 1];
  const moveDur = Math.min(1.0, Math.max(0.3, (sec.end - sec.start) * 0.45));
  const p = smooth(clamp01((t - sec.start) / moveDur));
  const from = prev ? prev.camTo : { cx: sec.camTo.cx, w: sec.camTo.w * 1.18 };
  const cam = {
    cx: from.cx + (sec.camTo.cx - from.cx) * p,
    w: from.w + (sec.camTo.w - from.w) * p,
  };
  const s = DW / cam.w;
  ctx.save();
  ctx.translate(DW / 2, groundScreenY);
  ctx.scale(s, s);
  ctx.translate(-cam.cx, -sec.groundY);

  // Cables (under components)
  const cables = sec.cables || [];
  for (let ci = 0; ci < cables.length; ci++) {
    const c = cables[ci];
    const ctrlY = Math.min(c.y1, c.y2) - 150;
    const mx = (c.x1 + c.x2) / 2;
    ctx.beginPath();
    ctx.moveTo(c.x1, c.y1);
    ctx.quadraticCurveTo(mx, ctrlY, c.x2, c.y2);
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 5;
    if (c.isNew) {
      const q = clamp01((t - sec.start - 0.15) / 0.7);
      const len = Math.hypot(c.x2 - c.x1, c.y2 - c.y1) * 1.3 + 30;
      ctx.setLineDash([len * q, len + 60]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = c.color;
    for (const [nx, ny] of [[c.x1, c.y1], [c.x2, c.y2]]) ctx.fillRect(nx - 7, ny - 7, 14, 14);
    // Packets (Fase 2): two squares per cable travelling from -> to, phase
    // quantised to the 0.25s cache grid; new cables start flowing once
    // their draw-on has finished.
    if (!c.isNew || t - sec.start > 0.95) {
      const tb = Math.floor(t * 4) / 4;
      for (const off of [0, 0.5]) {
        const u = (tb * 0.45 + ci * 0.37 + off) % 1;
        const v = 1 - u;
        const px = v * v * c.x1 + 2 * v * u * mx + u * u * c.x2;
        const py = v * v * c.y1 + 2 * v * u * ctrlY + u * u * c.y2;
        ctx.fillStyle = c.color;
        ctx.fillRect(px - 8, py - 8, 16, 16);
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2.5;
        ctx.strokeRect(px - 8, py - 8, 16, 16);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
      }
    }
  }

  // Components
  for (const comp of sec.components || []) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(comp.x, sec.groundY + 8, 86, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = DARK ? "rgba(255,255,255,0.13)" : "rgba(35,39,46,0.10)";
    ctx.fill();
    let pop = 1;
    if (comp.isNew) {
      pop = clamp01((t - sec.start) / 0.45);
      ctx.globalAlpha = pop;
      ctx.translate(comp.x, sec.groundY);
      ctx.scale(0.82 + 0.18 * pop, 0.82 + 0.18 * pop);
      ctx.translate(-comp.x, -sec.groundY);
    }
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    (COMP[comp.comp] || COMP.kotak)(ctx, comp.x, sec.groundY, t);
    ctx.restore();
    if (comp.label) {
      ctx.save();
      ctx.font = `23px InterM`;
      ctx.fillStyle = LABEL;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(comp.label, comp.x, sec.groundY + 26);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawHeadline(ctx, sec) {
  const badgeText = String(sec.badge || "").toUpperCase();
  let badgeW = 0;
  if (badgeText) {
    ctx.font = `24px InterB`;
    badgeW = ctx.measureText(badgeText).width + 40;
    rr(ctx, DW - 46 - badgeW, 56, badgeW, 46, 23);
    ctx.fillStyle = sec.badgeColor || "#6B7280";
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, DW - 46 - badgeW + 20, 56 + 24);
  }
  const text = String(sec.headline || "");
  if (!text) return;
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim();
  const accWords = norm(sec.accent || "").split(/\s+/).filter(Boolean);
  let size = 57;
  ctx.font = `${size}px InterX`;
  const maxW = DW - 92 - (badgeW ? badgeW + 18 : 0);
  const words = text.split(/\s+/).filter(Boolean).map((w) => ({ w, width: 0 }));
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
  // accent marking (contiguous normalized match)
  if (accWords.length) {
    const flat = [];
    lines.forEach((ln) => ln.forEach((o) => flat.push(o)));
    const seq = flat.map((o) => norm(o.w));
    outer: for (let i = 0; i + accWords.length <= seq.length; i++) {
      for (let j = 0; j < accWords.length; j++) if (seq[i + j] !== accWords[j]) continue outer;
      for (let j = 0; j < accWords.length; j++) flat[i + j].hl = true;
      break;
    }
  }
  ctx.textBaseline = "middle";
  lines.slice(0, 2).forEach((ln, li) => {
    let x = 46;
    const y = 84 + li * 68;
    for (const o of ln) {
      ctx.fillStyle = o.hl ? ACCENT : INK;
      ctx.fillText(o.w, x, y);
      x += o.width + space;
    }
  });
}

// Step checklist tracker (Fase 2): subject label + state boxes under the
// headline. States: todo (empty), ask ("?"), ok (green check), bad (red X).
// Steps introduced or changed in this section pop in.
function drawTracker(ctx, sec, t) {
  const tr = sec.tracker;
  if (!tr || (!tr.subject && !(tr.steps || []).length)) return;
  const y = 208;
  let x = 46;
  ctx.textBaseline = "middle";
  if (tr.subject) {
    ctx.font = `25px InterB`;
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.fillText(String(tr.subject), x, y + 15);
    x += ctx.measureText(String(tr.subject)).width + 26;
  }
  for (const st of tr.steps || []) {
    const label = String(st.label || "").toUpperCase();
    ctx.font = `16px InterM`;
    const labelW = ctx.measureText(label).width;
    const slotW = Math.max(48, labelW + 18);
    const boxX = x + (slotW - 30) / 2;
    const cx = boxX + 15, cy = y + 15;
    let pop = 1;
    if (st.fresh) pop = clamp01((t - sec.start) / 0.45);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(0.7 + 0.3 * pop, 0.7 + 0.3 * pop);
    ctx.translate(-cx, -cy);
    ctx.globalAlpha = 0.3 + 0.7 * pop;
    rr(ctx, boxX, y, 30, 30, 7);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
    if (st.state === "ok") {
      ctx.strokeStyle = "#1F9D55";
      ctx.lineWidth = 4.5;
      ctx.lineCap = "round";
      line(ctx, boxX + 7, y + 16, boxX + 13, y + 22);
      line(ctx, boxX + 13, y + 22, boxX + 24, y + 8);
      ctx.lineCap = "butt";
    } else if (st.state === "bad") {
      ctx.strokeStyle = "#D64541";
      ctx.lineWidth = 4.5;
      ctx.lineCap = "round";
      line(ctx, boxX + 9, y + 9, boxX + 21, y + 21);
      line(ctx, boxX + 21, y + 9, boxX + 9, y + 21);
      ctx.lineCap = "butt";
    } else if (st.state === "ask") {
      ctx.font = `21px InterX`;
      ctx.fillStyle = "#23272E"; // the box stays white in both themes
      ctx.textAlign = "center";
      ctx.fillText("?", cx, cy + 1);
    }
    ctx.restore();
    ctx.font = `16px InterM`;
    ctx.fillStyle = LABEL;
    ctx.textAlign = "center";
    ctx.fillText(label, x + slotW / 2, y + 47);
    ctx.textAlign = "left";
    x += slotW + 4;
    if (x > DW - 120) break;
  }
}

// Terminal data card (Fase 2): black rounded card, mono text, pops in
// shortly after its section starts. Screen-space, under the tracker row.
function drawCard(ctx, sec, t) {
  const card = sec.card;
  if (!card || !(card.lines || []).length) return;
  const hasTracker = sec.tracker && (sec.tracker.subject || (sec.tracker.steps || []).length);
  const x = 46;
  const y = hasTracker ? 292 : 226;
  ctx.font = `19px MonoB`;
  let w = ctx.measureText(String(card.title || "")).width;
  ctx.font = `19px Mono`;
  for (const l of card.lines) w = Math.max(w, ctx.measureText(String(l)).width);
  const cardW = Math.min(DW - 92, w + 42);
  const cardH = 46 + card.lines.length * 27 + 12;
  const pop = clamp01((t - sec.start - 0.3) / 0.4);
  if (pop <= 0) return;
  ctx.save();
  ctx.globalAlpha = pop;
  ctx.translate(x, y);
  ctx.scale(0.92 + 0.08 * pop, 0.92 + 0.08 * pop);
  ctx.translate(-x, -y);
  rr(ctx, x, y, cardW, cardH, 12);
  ctx.fillStyle = "#101216";
  ctx.fill();
  if (DARK) {
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.font = `19px MonoB`;
  ctx.fillStyle = "#35C26E";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(String(card.title || "DATA"), x + 20, y + 25);
  const dots = ["#D64541", "#E3A008", "#35C26E"];
  dots.forEach((dc, i) => {
    ctx.beginPath();
    ctx.arc(x + cardW - 24 - (2 - i) * 22, y + 25, 6, 0, Math.PI * 2);
    ctx.fillStyle = dc;
    ctx.fill();
  });
  ctx.font = `19px Mono`;
  ctx.fillStyle = "#E8EAED";
  card.lines.forEach((l, i) => ctx.fillText(String(l), x + 20, y + 58 + i * 27));
  ctx.restore();
}

function drawCaption(ctx, cue) {
  let size = 35;
  ctx.font = `${size}px InterB`;
  const maxTextW = DW - 130;
  let textW = ctx.measureText(cue.text).width;
  while (textW > maxTextW && size > 24) {
    size -= 2; ctx.font = `${size}px InterB`;
    textW = ctx.measureText(cue.text).width;
  }
  const barW = Math.min(DW - 56, textW + 56);
  const barH = 64;
  const barX = (DW - barW) / 2;
  const barY = DH - (planeKind === "l" ? 118 : 172) * S;
  rr(ctx, barX, barY, barW, barH, 32);
  ctx.fillStyle = "#101216";
  ctx.fill();
  if (DARK) {
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // words with one highlighted
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const hl = norm(cue.highlight || "");
  const words = cue.text.split(/\s+/).filter(Boolean).map((w) => ({ w, width: ctx.measureText(w).width }));
  const space = ctx.measureText(" ").width;
  let x = (DW - textW) / 2;
  ctx.textBaseline = "middle";
  for (const o of words) {
    if (hl && norm(o.w) === hl) {
      rr(ctx, x - 7, barY + 9, o.width + 14, barH - 18, 9);
      ctx.fillStyle = YELLOW;
      ctx.fill();
      ctx.fillStyle = "#101216";
    } else {
      ctx.fillStyle = "#FFFFFF";
    }
    ctx.fillText(o.w, x, barY + barH / 2 + 1);
    x += o.width + space;
  }
  return barY + barH;
}

function drawFrame(t) {
  const canvas = drawFrame.canvas || (drawFrame.canvas = createCanvas(W, H));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(SX, 0, 0, SY, 0, 0);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, DW, DH);

  const sec = SECTIONS.find((s) => t >= s.start && t < s.end) || SECTIONS[SECTIONS.length - 1];
  if (!sec) return canvas;

  const groundScreenY = DH * (planeKind === "l" ? 0.74 : 0.735);
  drawWorld(ctx, sec, t, groundScreenY);
  if (!sec.closing) {
    drawHeadline(ctx, sec);
    drawTracker(ctx, sec, t);
    drawCard(ctx, sec, t);
  }

  const cue = (sec.captions || []).find((c) => t >= c.start && t < c.end);
  let barBottom = 0;
  if (cue) barBottom = drawCaption(ctx, cue);

  if (M.watermark) {
    ctx.font = `24px InterM`;
    ctx.fillStyle = "#A39E93";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const wmY = barBottom ? barBottom + 34 * S : DH - 44 * S;
    ctx.fillText(String(M.watermark), DW / 2, wmY);
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
    const sec = SECTIONS.find((s) => t >= s.start && t < s.end) || SECTIONS[SECTIONS.length - 1];
    const cue = sec ? (sec.captions || []).findIndex((c) => t >= c.start && t < c.end) : -1;
    const animating = sec && t - sec.start < 1.3;
    const sig = animating ? `a${f}` : `${SECTIONS.indexOf(sec)}|${cue}|${Math.floor(t * 4)}`;
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
  console.log(`diagram render ok: ${outPath} (${TOTAL.toFixed(2)}s, ${frames} frames)`);
}

main().catch((e) => {
  console.error(String(e.stack || e));
  process.exit(1);
});
