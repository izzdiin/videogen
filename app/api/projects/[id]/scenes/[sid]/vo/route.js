import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { loadProject, saveProject, projectDir } from "../../../../../../../lib/store.js";
import { synthesize, synthesizeGemini, synthesizeClaude, synthesizeElevenLabs, probeDuration } from "../../../../../../../lib/tts.js";
import { isGeminiVoice, defaultGeminiVoice, isClaudeVoice, defaultClaudeVoice, isElevenLabsVoice, defaultElevenLabsVoice } from "../../../../../../../lib/voices.js";
import { activeSceneJobs, sceneJobKey, SCENE_JOB_STALE_MS } from "../../../../../../../lib/jobs.js";

export const dynamic = "force-dynamic";

// Isi scene.vo dengan voice over hasil sintesis, sesuai mesin VO proyek.
// Melempar Error bila gagal; penulisan status akhir ke project.json
// diatur pemanggil.
async function produceVo(project, scene, body) {
  if (!scene.narration?.trim()) throw new Error("Teks narasi scene ini masih kosong.");
  const rel = `vo/${scene.id}.mp3`;
  const abs = path.join(projectDir(project.id), rel);
  // Pilihan per scene (dari wizard) menimpa eksekutor proyek bila valid.
  const VO_PROVIDERS = ["edge-tts", "gemini-tts", "muse-bridge", "elevenlabs"];
  const provider = VO_PROVIDERS.includes(body.provider) ? body.provider : project.executors.voProvider || "edge-tts";
  if (provider === "muse-bridge") {
    const wanted = body.voice || project.executors.voice;
    const voice = isClaudeVoice(wanted) ? wanted : defaultClaudeVoice();
    const { duration } = await synthesizeClaude(scene.narration, voice, abs, project.audience === "en" ? "en" : "id");
    scene.vo = { status: "ready", file: rel, duration, source: "muse-bridge", voice, updatedAt: new Date().toISOString() };
  } else if (provider === "gemini-tts") {
    const wanted = body.voice || project.executors.voice;
    const voice = isGeminiVoice(wanted) ? wanted : defaultGeminiVoice();
    const { duration } = await synthesizeGemini(scene.narration, voice, abs);
    scene.vo = { status: "ready", file: rel, duration, source: "gemini-tts", voice, updatedAt: new Date().toISOString() };
  } else if (provider === "elevenlabs") {
    const wanted = body.voice || project.executors.voice;
    const voice = isElevenLabsVoice(wanted) ? wanted : wanted && String(wanted).length >= 20 ? wanted : defaultElevenLabsVoice();
    const { duration } = await synthesizeElevenLabs(scene.narration, voice, abs);
    scene.vo = { status: "ready", file: rel, duration, source: "elevenlabs", voice, updatedAt: new Date().toISOString() };
  } else {
    const voice = body.voice || project.executors.voice;
    const { duration } = await synthesize(scene.narration, voice, abs);
    scene.vo = { status: "ready", file: rel, duration, source: "edge-tts", voice, updatedAt: new Date().toISOString() };
  }
}

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
      saveProject(project);
      return NextResponse.json({ project });
    }

    // Jalur generate (JSON): sama seperti gambar per scene, sintesis bisa
    // makan waktu lama (muse-bridge menunggu sampai 25 menit), jadi
    // pekerjaan berjalan di latar belakang server dan handler kembali
    // segera. Klien memantau status scene.vo: generating → ready/error.
    const body = await req.json().catch(() => ({}));
    if (!scene.narration?.trim()) throw new Error("Teks narasi scene ini masih kosong.");
    const key = sceneJobKey(project.id, scene.id, "vo");
    const runningAt = activeSceneJobs.get(key);
    if (runningAt && Date.now() - new Date(runningAt).getTime() < SCENE_JOB_STALE_MS) {
      return NextResponse.json({ project, started: false, generating: true });
    }
    scene.vo = { status: "generating", startedAt: new Date().toISOString() };
    saveProject(project);
    activeSceneJobs.set(key, new Date().toISOString());
    (async () => {
      try {
        const p = loadProject(project.id);
        const s = p?.scenes.find((x) => x.id === scene.id);
        if (!p || !s) return;
        await produceVo(p, s, body);
        const pf = loadProject(project.id);
        const sf = pf?.scenes.find((x) => x.id === scene.id);
        // Tulis hasil hanya bila status masih "generating": unggahan
        // manual di tengah jalan tidak boleh tertimpa hasil generate.
        if (sf && sf.vo?.status === "generating") {
          sf.vo = s.vo;
          saveProject(pf);
        }
      } catch (e) {
        try {
          const pf = loadProject(project.id);
          const sf = pf?.scenes.find((x) => x.id === scene.id);
          if (sf && sf.vo?.status === "generating") {
            sf.vo = { status: "error", error: String(e.message || e), updatedAt: new Date().toISOString() };
            saveProject(pf);
          }
        } catch {}
      } finally {
        activeSceneJobs.delete(key);
      }
    })().catch(() => {});
    return NextResponse.json({ project, started: true }, { status: 202 });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
