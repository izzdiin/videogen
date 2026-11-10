import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { loadProject, saveProject, projectDir, sweepAssetDir } from "../../../../../../../lib/store.js";
import { probeDuration, probeHasAudio } from "../../../../../../../lib/tts.js";

export const dynamic = "force-dynamic";

const OK_EXT = ["mp4", "webm", "mov", "mkv"];

// Unggah video per scene untuk mode sumber visual "flow": pengguna
// membuat video tiap scene secara manual di Google Flow dari prompt
// yang disediakan wizard, mengunduh hasilnya, lalu mengunggahnya di
// sini. Saat rakit, klip inilah yang menjadi visual scene.
export async function POST(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  const scene = project.scenes.find((s) => s.id === params.sid);
  if (!scene) return NextResponse.json({ error: "Scene tidak ditemukan." }, { status: 404 });

  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Mode Flow bersifat manual: unggah berkas video hasil Flow untuk scene ini." },
      { status: 400 }
    );
  }
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") throw new Error("File tidak ada.");
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!OK_EXT.includes(ext)) throw new Error("Format video harus mp4, webm, mov, atau mkv.");
    const dir = path.join(projectDir(project.id), "assets", "videos");
    fs.mkdirSync(dir, { recursive: true });
    sweepAssetDir(project.id, "assets/videos", scene.id + ".");
    sweepAssetDir(project.id, "clips", scene.id + ".");
    const rel = `assets/videos/${scene.id}.${ext}`;
    const abs = path.join(projectDir(project.id), rel);
    fs.writeFileSync(abs, Buffer.from(await file.arrayBuffer()));
    const duration = await probeDuration(abs);
    const hasAudio = await probeHasAudio(abs);
    scene.video = { status: "ready", file: rel, duration, hasAudio, source: "flow-upload", updatedAt: new Date().toISOString() };
    saveProject(project);
    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
