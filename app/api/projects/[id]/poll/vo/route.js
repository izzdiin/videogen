import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { loadProject, saveProject, projectDir } from "../../../../../../lib/store.js";
import { synthesize, synthesizeGemini, synthesizeClaude, synthesizeElevenLabs, probeDuration } from "../../../../../../lib/tts.js";
import { isGeminiVoice, defaultGeminiVoice, isClaudeVoice, defaultClaudeVoice, isElevenLabsVoice, defaultElevenLabsVoice } from "../../../../../../lib/voices.js";
import { activeSceneJobs, sceneJobKey, SCENE_JOB_STALE_MS } from "../../../../../../lib/jobs.js";

export const dynamic = "force-dynamic";

// Voice over kartu polling penutup (Slides): asetnya menempel pada
// project.poll.vo, teksnya project.poll.voText. Pola sama dengan VO
// per scene — generate berjalan async di latar belakang, unggahan
// manual/rekaman menggantikan hasil generate, dan hasil generate
// tidak menimpa unggahan yang masuk di tengah jalan.
async function producePollVo(project, body) {
  const text = project.poll?.voText?.trim();
  if (!text) throw new Error("Teks VO polling masih kosong.");
  const rel = `vo/poll.mp3`;
  const abs = path.join(projectDir(project.id), rel);
  const VO_PROVIDERS = ["edge-tts", "gemini-tts", "muse-bridge", "elevenlabs"];
  const provider = VO_PROVIDERS.includes(body.provider) ? body.provider : project.executors.voProvider || "edge-tts";
  if (provider === "muse-bridge") {
    const wanted = body.voice || project.executors.voice;
    const voice = isClaudeVoice(wanted) ? wanted : defaultClaudeVoice();
    const { duration } = await synthesizeClaude(text, voice, abs, project.audience === "en" ? "en" : "id");
    project.poll.vo = { status: "ready", file: rel, duration, source: "muse-bridge", voice, updatedAt: new Date().toISOString() };
  } else if (provider === "gemini-tts") {
    const wanted = body.voice || project.executors.voice;
    const voice = isGeminiVoice(wanted) ? wanted : defaultGeminiVoice();
    const { duration } = await synthesizeGemini(text, voice, abs);
    project.poll.vo = { status: "ready", file: rel, duration, source: "gemini-tts", voice, updatedAt: new Date().toISOString() };
  } else if (provider === "elevenlabs") {
    const wanted = body.voice || project.executors.voice;
    const voice = isElevenLabsVoice(wanted) ? wanted : wanted && String(wanted).length >= 20 ? wanted : defaultElevenLabsVoice();
    const { duration } = await synthesizeElevenLabs(text, voice, abs);
    project.poll.vo = { status: "ready", file: rel, duration, source: "elevenlabs", voice, updatedAt: new Date().toISOString() };
  } else {
    const voice = body.voice || project.executors.voice;
    const { duration } = await synthesize(text, voice, abs);
    project.poll.vo = { status: "ready", file: rel, duration, source: "edge-tts", voice, updatedAt: new Date().toISOString() };
  }
}

function clearOldVoFiles(project) {
  const dir = path.join(projectDir(project.id), "vo");
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith("poll.")) fs.rmSync(path.join(dir, f), { force: true });
  }
}

export async function POST(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  if (!project.poll) project.poll = { question: "", options: [], voText: "", vo: { status: "none" } };

  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") throw new Error("File tidak ada.");
      const ext = (file.name.split(".").pop() || "mp3").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp3";
      clearOldVoFiles(project);
      const rel = `vo/poll.${ext}`;
      const abs = path.join(projectDir(project.id), rel);
      fs.writeFileSync(abs, Buffer.from(await file.arrayBuffer()));
      const duration = await probeDuration(abs);
      project.poll.vo = { status: "ready", file: rel, duration, source: "upload", updatedAt: new Date().toISOString() };
      saveProject(project);
      return NextResponse.json({ project });
    }

    const body = await req.json().catch(() => ({}));
    if (!project.poll.voText?.trim()) {
      throw new Error("Teks VO polling masih kosong — isi dulu teksnya di pengaturan kartu polling, lalu simpan.");
    }
    const key = sceneJobKey(project.id, "poll", "vo");
    const runningAt = activeSceneJobs.get(key);
    if (runningAt && Date.now() - new Date(runningAt).getTime() < SCENE_JOB_STALE_MS) {
      return NextResponse.json({ project, started: false, generating: true });
    }
    project.poll.vo = { status: "generating", startedAt: new Date().toISOString() };
    saveProject(project);
    activeSceneJobs.set(key, new Date().toISOString());
    (async () => {
      try {
        const p = loadProject(project.id);
        if (!p || !p.poll) return;
        await producePollVo(p, body);
        const pf = loadProject(project.id);
        if (pf?.poll && pf.poll.vo?.status === "generating") {
          pf.poll.vo = p.poll.vo;
          saveProject(pf);
        }
      } catch (e) {
        try {
          const pf = loadProject(project.id);
          if (pf?.poll && pf.poll.vo?.status === "generating") {
            pf.poll.vo = { status: "error", error: String(e.message || e), updatedAt: new Date().toISOString() };
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

export async function DELETE(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  if (project.poll) {
    clearOldVoFiles(project);
    project.poll.vo = { status: "none" };
    saveProject(project);
  }
  return NextResponse.json({ project });
}
