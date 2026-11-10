import path from "path";
import { NextResponse } from "next/server";
import { loadProject, saveProject, projectDir } from "../../../../../../../lib/store.js";
import { activeSceneJobs, sceneJobKey, SCENE_JOB_STALE_MS } from "../../../../../../../lib/jobs.js";
import { transcribeSceneWords } from "../../../../../../../lib/asr.js";

export const dynamic = "force-dynamic";

// Timestamp kata per scene (Fase D): ASR kata-paksa Gemini atas VO
// scene menghasilkan scene.words {status, source:"asr-gemini",
// model, items:[{w,a,b}]}. Renderer gaya karaoke/dynamic/satukata
// memakainya; tanpa ini renderer jatuh ke estimasi karakter.
// Berjalan async seperti generate gambar/VO (model bisa 2-4 menit).
function findScene(project, sid) {
  return (project.scenes || []).find((s) => s.id === sid);
}

export async function POST(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  const scene = findScene(project, params.sid);
  if (!scene) return NextResponse.json({ error: "Scene tidak ditemukan." }, { status: 404 });
  if (scene.vo?.status !== "ready" || !scene.vo.file) {
    return NextResponse.json({ error: "Voice over scene belum siap — transkrip butuh VO." }, { status: 400 });
  }
  if (!String(scene.narration || "").trim()) {
    return NextResponse.json({ error: "Narasi scene kosong." }, { status: 400 });
  }
  const key = sceneJobKey(project.id, scene.id, "words");
  const runningAt = activeSceneJobs.get(key);
  if (runningAt && Date.now() - new Date(runningAt).getTime() < SCENE_JOB_STALE_MS) {
    return NextResponse.json({ project, started: false, generating: true });
  }
  scene.words = { status: "generating", startedAt: new Date().toISOString() };
  saveProject(project);
  activeSceneJobs.set(key, new Date().toISOString());
  const voAbs = path.join(projectDir(project.id), scene.vo.file);
  const narration = scene.narration;
  (async () => {
    try {
      const { items, model } = await transcribeSceneWords(voAbs, narration);
      const pf = loadProject(project.id);
      const sf = pf && findScene(pf, scene.id);
      if (sf && sf.words?.status === "generating" && sf.narration === narration) {
        sf.words = { status: "ready", source: "asr-gemini", model, items, updatedAt: new Date().toISOString() };
        saveProject(pf);
      }
    } catch (e) {
      try {
        const pf = loadProject(project.id);
        const sf = pf && findScene(pf, scene.id);
        if (sf && sf.words?.status === "generating") {
          sf.words = { status: "error", error: String(e.message || e).slice(0, 300), updatedAt: new Date().toISOString() };
          saveProject(pf);
        }
      } catch {}
    } finally {
      activeSceneJobs.delete(key);
    }
  })();
  return NextResponse.json({ project, started: true }, { status: 202 });
}

export async function DELETE(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  const scene = findScene(project, params.sid);
  if (!scene) return NextResponse.json({ error: "Scene tidak ditemukan." }, { status: 404 });
  scene.words = null;
  saveProject(project);
  return NextResponse.json({ project });
}
