import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { NextResponse } from "next/server";
import { loadProject, projectDir } from "../../../../../lib/store.js";

const execFileP = promisify(execFile);
export const dynamic = "force-dynamic";

// Contact sheet (Fase A, butir 2): satu gambar grid berisi semua gambar
// scene yang siap, untuk memeriksa konsistensi karakter & gaya sekilas
// sebelum render. Hasilnya previews/contact-sheet.jpg.
export async function POST(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  const dir = projectDir(project.id);
  const images = [];
  for (const s of project.scenes || []) {
    if (s.image?.status === "ready" && s.image.file) {
      const abs = path.join(dir, s.image.file);
      if (fs.existsSync(abs)) images.push(abs);
    }
  }
  if (!images.length) {
    return NextResponse.json({ error: "Belum ada gambar scene yang siap untuk contact sheet." }, { status: 400 });
  }
  const n = images.length;
  const cols = Math.min(4, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  const filters = [];
  const labels = [];
  images.forEach((_, i) => {
    filters.push(`[${i}:v]scale=360:640:force_original_aspect_ratio=decrease,pad=360:640:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`);
    labels.push(`[v${i}]`);
  });
  filters.push(`${labels.join("")}tile=${cols}x${rows}:padding=6:margin=6[out]`);
  const rel = "previews/contact-sheet.jpg";
  const outAbs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  try {
    await execFileP(
      "ffmpeg",
      ["-y", ...images.flatMap((f) => ["-i", f]), "-filter_complex", filters.join(";"), "-map", "[out]", "-frames:v", "1", "-q:v", "3", outAbs],
      { timeout: 120000, maxBuffer: 1024 * 1024 * 16 }
    );
  } catch (e) {
    return NextResponse.json({ error: "ffmpeg gagal membuat contact sheet: " + String(e.stderr || e.message || e).slice(-300) }, { status: 502 });
  }
  return NextResponse.json({ file: rel, count: n, updatedAt: new Date().toISOString() });
}
