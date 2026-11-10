import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { loadProject, saveProject, projectDir, sweepAssetDir } from "../../../../../../../lib/store.js";

export const dynamic = "force-dynamic";

const AUDIO_EXTS = ["mp3", "wav", "m4a", "ogg", "opus", "flac", "aac"];

// Efek suara (SFX) per scene: dimainkan dari awal scene saat render
// Slides, dicampur di atas narasi dengan volume scene.sfxVolume —
// tersinkron dengan animasi karena menempel pada segmen scene itu.
export async function POST(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  const scene = project.scenes.find((s) => s.id === params.sid);
  if (!scene) return NextResponse.json({ error: "Scene tidak ditemukan." }, { status: 404 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") throw new Error("File tidak ada.");
    const ext = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!AUDIO_EXTS.includes(ext)) {
      throw new Error("Format efek suara harus salah satu dari: " + AUDIO_EXTS.join(", ") + ".");
    }
    const dir = path.join(projectDir(project.id), "assets", "audio");
    fs.mkdirSync(dir, { recursive: true });
    sweepAssetDir(project.id, "assets/audio", "sfx-" + scene.id + ".");
    sweepAssetDir(project.id, "sfx", scene.id + ".");
    const rel = `assets/audio/sfx-${scene.id}.${ext}`;
    fs.writeFileSync(path.join(projectDir(project.id), rel), Buffer.from(await file.arrayBuffer()));
    scene.sfx = {
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
  const scene = project.scenes.find((s) => s.id === params.sid);
  if (!scene) return NextResponse.json({ error: "Scene tidak ditemukan." }, { status: 404 });
  sweepAssetDir(project.id, "assets/audio", "sfx-" + scene.id + ".");
  sweepAssetDir(project.id, "sfx", scene.id + ".");
  scene.sfx = { status: "none" };
  saveProject(project);
  return NextResponse.json({ project });
}
