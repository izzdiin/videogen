import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { loadProject, saveProject, projectDir, sweepAssetDir } from "../../../../../lib/store.js";
import { audioFromPreset } from "../../../../../lib/audioPresets.js";

export const dynamic = "force-dynamic";

const AUDIO_EXTS = ["mp3", "wav", "m4a", "ogg", "opus", "flac", "aac"];

// Musik latar (BGM) proyek: satu berkas per proyek, diunggah user.
// Parameter campurannya (volume, ducking, fade, normalisasi) diatur
// lewat PATCH proyek; route ini hanya mengelola berkasnya.
export async function POST(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") throw new Error("File tidak ada.");
    const ext = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!AUDIO_EXTS.includes(ext)) {
      throw new Error("Format musik harus salah satu dari: " + AUDIO_EXTS.join(", ") + ".");
    }
    const dir = path.join(projectDir(project.id), "assets", "music");
    fs.mkdirSync(dir, { recursive: true });
    sweepAssetDir(project.id, "assets/music", "bgm.");
    sweepAssetDir(project.id, "audio", "bgm.");
    const rel = `assets/music/bgm.${ext}`;
    fs.writeFileSync(path.join(projectDir(project.id), rel), Buffer.from(await file.arrayBuffer()));
    if (!project.audio) project.audio = audioFromPreset("edukatif");
    project.audio.bgm = {
      status: "ready",
      file: rel,
      name: String(file.name || "").slice(0, 120),
      updatedAt: new Date().toISOString(),
    };
    saveProject(project);
    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}

export async function DELETE(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  sweepAssetDir(project.id, "assets/music", "bgm.");
  sweepAssetDir(project.id, "audio", "bgm.");
  if (project.audio) project.audio.bgm = { status: "none" };
  saveProject(project);
  return NextResponse.json({ project });
}
