import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { loadProject, saveProject, projectDir } from "../../../../../../../lib/store.js";
import { synthesize, synthesizeGemini, synthesizeClaude, probeDuration } from "../../../../../../../lib/tts.js";
import { isGeminiVoice, defaultGeminiVoice, isClaudeVoice, defaultClaudeVoice } from "../../../../../../../lib/voices.js";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  const scene = project.scenes.find((s) => s.id === params.sid);
  if (!scene) return NextResponse.json({ error: "Scene tidak ditemukan." }, { status: 404 });

  const dir = path.join(projectDir(project.id), "vo");
  fs.mkdirSync(dir, { recursive: true });
  const clearOld = () => {
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith(scene.id + ".")) fs.rmSync(path.join(dir, f), { force: true });
    }
  };

  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") throw new Error("File tidak ada.");
      const ext = (file.name.split(".").pop() || "mp3").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp3";
      clearOld();
      const rel = `vo/${scene.id}.${ext}`;
      const abs = path.join(projectDir(project.id), rel);
      fs.writeFileSync(abs, Buffer.from(await file.arrayBuffer()));
      const duration = await probeDuration(abs);
      scene.vo = { status: "ready", file: rel, duration, source: "upload", updatedAt: new Date().toISOString() };
    } else {
      const body = await req.json().catch(() => ({}));
      if (!scene.narration?.trim()) throw new Error("Teks narasi scene ini masih kosong.");
      const rel = `vo/${scene.id}.mp3`;
      const abs = path.join(projectDir(project.id), rel);
      if ((project.executors.voProvider || "edge-tts") === "muse-bridge") {
        const wanted = body.voice || project.executors.voice;
        const voice = isClaudeVoice(wanted) ? wanted : defaultClaudeVoice();
        const { duration } = await synthesizeClaude(scene.narration, voice, abs, project.audience === "en" ? "en" : "id");
        scene.vo = { status: "ready", file: rel, duration, source: "muse-bridge", updatedAt: new Date().toISOString() };
      } else if ((project.executors.voProvider || "edge-tts") === "gemini-tts") {
        const voice = isGeminiVoice(project.executors.voice) ? project.executors.voice : defaultGeminiVoice();
        const { duration } = await synthesizeGemini(scene.narration, voice, abs);
        scene.vo = { status: "ready", file: rel, duration, source: "gemini-tts", updatedAt: new Date().toISOString() };
      } else {
        const { duration } = await synthesize(
          scene.narration,
          body.voice || project.executors.voice,
          abs
        );
        scene.vo = { status: "ready", file: rel, duration, source: "edge-tts", updatedAt: new Date().toISOString() };
      }
    }
    saveProject(project);
    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
