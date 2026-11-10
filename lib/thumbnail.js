// Thumbnail video (modul mandiri): menyusun gambar sampul siap
// platform dari aset yang SUDAH ada di proyek — tanpa memanggil
// provider gambar baru.
//
// Sumber gambar, berurutan:
//   1. gambar hero Editorial (scene pertama) bila ada,
//   2. gambar latar scene Slides pertama yang siap,
//   3. gambar referensi karakter pertama yang siap (potret),
//   4. frame dari render final/draf pada detik ke-2 (ffmpeg).
// Teks judul digambar dengan drawtext Inter ExtraBold di sepertiga
// bawah di atas pita gelap tembus pandang — pola yang sama dengan
// overlay di renderer. Keluaran: exports/thumbnail.jpg mengikuti
// rasio aspek proyek pada resolusi finalnya.
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { projectDir } from "./store.js";
import { wrapText } from "./renderText.js";

export const THUMBNAIL_REL = "exports/thumbnail.jpg";

const FONT_BOLD = path.join(process.cwd(), "public", "fonts", "Inter-ExtraBold-static.ttf");

const DIMS = {
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "16:9": [1920, 1080],
};

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.slice(-500)}`))));
  });
}

function firstReadyImage(project) {
  const dir = projectDir(project.id);
  const candidates = [];
  for (const s of project.scenes || []) {
    if (s.image?.status === "ready" && s.image.file) candidates.push(s.image.file);
  }
  for (const c of project.characters || []) {
    if (c.referenceImage?.status === "ready" && c.referenceImage.file) candidates.push(c.referenceImage.file);
  }
  for (const rel of candidates) {
    const abs = path.join(dir, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function renderFile(project) {
  const dir = projectDir(project.id);
  for (const kind of ["final", "draft"]) {
    const r = project.renders?.[kind];
    if (r?.status === "done" && r.file) {
      const abs = path.join(dir, r.file);
      if (fs.existsSync(abs)) return abs;
    }
  }
  return null;
}

async function extractFrame(videoAbs, outAbs, w, h) {
  const tmp = outAbs + ".frame.jpg";
  await run("ffmpeg", [
    "-y", "-ss", "2", "-i", videoAbs,
    "-frames:v", "1", "-vf", `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`,
    "-q:v", "3", tmp,
  ]);
  return tmp;
}

// Bangun thumbnail; melempar Error berbahasa Indonesia bila tidak ada
// sumber gambar sama sekali. Mengembalikan metadata aset untuk
// disimpan ke project.social.thumbnail.
export async function buildThumbnail(project, titleOverride) {
  const dir = projectDir(project.id);
  const [w, h] = DIMS[project.aspect] || DIMS["9:16"];
  const outAbs = path.join(dir, THUMBNAIL_REL);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });

  let srcAbs = firstReadyImage(project);
  let fromFrame = false;
  if (!srcAbs) {
    const video = renderFile(project);
    if (!video) {
      throw new Error("Belum ada sumber gambar untuk thumbnail: buat dulu gambar scene, gambar referensi karakter, atau render video.");
    }
    srcAbs = await extractFrame(video, outAbs, w, h);
    fromFrame = true;
  }

  const title = String(titleOverride || project.title || "").trim();
  const filters = [`scale=${w}:${h}:force_original_aspect_ratio=increase`, `crop=${w}:${h}`];
  if (title) {
    const txtAbs = outAbs + ".title.txt";
    const maxChars = w >= h ? 22 : 16;
    fs.writeFileSync(txtAbs, wrapText(title.toUpperCase(), maxChars, 3));
    const fs1 = Math.round(w * 0.072);
    filters.push(
      `drawbox=x=0:y=ih*0.66:w=iw:h=ih*0.34:color=black@0.55:t=fill`,
      `drawtext=fontfile=${FONT_BOLD}:textfile=${txtAbs}:fontsize=${fs1}:fontcolor=white:borderw=3:bordercolor=black@0.6:x=(w-text_w)/2:y=h*0.72:line_spacing=12`
    );
  }
  try {
    await run("ffmpeg", ["-y", "-i", srcAbs, "-vf", filters.join(","), "-frames:v", "1", "-q:v", "3", outAbs]);
  } finally {
    if (fromFrame) fs.rmSync(srcAbs, { force: true });
    fs.rmSync(outAbs + ".title.txt", { force: true });
  }
  return {
    status: "ready",
    file: THUMBNAIL_REL,
    source: fromFrame ? "frame" : "gambar",
    updatedAt: new Date().toISOString(),
  };
}
