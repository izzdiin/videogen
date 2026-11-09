import fs from "fs";
import path from "path";
import { loadProject, saveProject, blankScene, projectDir } from "./store.js";
import { generateScript, generateImage, generateImageWorkersAI, generateImageVia9Router, generateImageViaBridge, generateImageViaVenice } from "./ai.js";
import { synthesize } from "./tts.js";
import { synthesizeGemini, synthesizeClaude, synthesizeElevenLabs } from "./tts.js";
import { isGeminiVoice, defaultGeminiVoice, isClaudeVoice, defaultClaudeVoice, isElevenLabsVoice, defaultElevenLabsVoice } from "./voices.js";
import { renderProject } from "./render.js";
import { slidesImagePrompt } from "./visualStyles.js";
import { renderStickman, ensureStickmanProps } from "./stickman.js";
import { renderDarkcard } from "./darkcard.js";
import { renderDiagram } from "./diagram.js";
import { renderEditorial, editorialImagePrompt } from "./editorial.js";
import { activeJobs, startJobHeartbeat } from "./jobs.js";

function setJob(id, job) {
  const p = loadProject(id);
  if (!p) return;
  p.job = { ...job, at: new Date().toISOString() };
  saveProject(p);
}

export async function runAuto(id) {
  if (activeJobs.has(id)) throw new Error("Sudah ada pekerjaan yang berjalan untuk proyek ini.");
  activeJobs.add(id);
  const stopHeartbeat = startJobHeartbeat(id, loadProject, saveProject);
  try {
    let p = loadProject(id);
    if (!p) throw new Error("Proyek tidak ditemukan.");

    // 1) Script
    if (p.scenes.length === 0) {
      setJob(id, { type: "auto", status: "running", step: "naskah", message: "Membuat naskah..." });
      if (!p.executors.scriptModel) throw new Error("Model naskah belum dipilih.");
      const scenes = await generateScript(p, p.executors.scriptModel);
      p = loadProject(id);
      p.scenes = scenes.map((s) => ({ ...blankScene(), ...s }));
      saveProject(p);
    }

    // 2) Images — stickman B1 memakai properti bawaan (hanya properti khusus
    // yang digambar SDXL); stickman B2 menggambar ilustrasi per scene memakai
    // penyedia gambar proyek. Mode slides memakai alur biasa.
    p = loadProject(id);
    if (p.engine === "stickman") {
      await ensureStickmanProps(p, (m) =>
        setJob(id, { type: "auto", status: "running", step: "gambar", message: m })
      );
      p = loadProject(id);
    }
    if (p.engine === "slides" && p.visualSource === "flow") {
      // Mode Flow: visual scene berasal dari video yang dibuat pengguna
      // secara manual di Google Flow lalu diunggah — tidak ada generate
      // gambar. Kelengkapan klip diperiksa sebelum tahap rakit.
      setJob(id, { type: "auto", status: "running", step: "gambar", message: "Mode Flow: tahap gambar dilewati (video manual dari Google Flow)." });
    } else if (p.engine === "slides" || p.engine === "editorial") for (let i = 0; i < p.scenes.length; i++) {
      const scene = p.scenes[i];
      if (scene.image?.status === "ready" && !scene.image.stale) continue;
      setJob(id, { type: "auto", status: "running", step: "gambar", message: `Membuat gambar scene ${i + 1}/${p.scenes.length}...` });
      const rel = `stills/${scene.id}.jpg`;
      const promptFor = p.engine === "editorial" ? editorialImagePrompt : slidesImagePrompt;
      const provider = p.executors.imageProvider || "pollinations";
      if (provider === "upload") {
        throw new Error(`Scene ${i + 1} belum punya gambar dan penyedia gambar adalah 'unggah manual'. Unggah dulu gambarnya, lalu jalankan otomatis lagi.`);
      }
      if (provider === "sdxl-9router") {
        await generateImageVia9Router(promptFor(p, scene), path.join(projectDir(id), rel), p.aspect);
        p = loadProject(id);
        p.scenes[i].image = { status: "ready", file: rel, source: "sdxl-9router", updatedAt: new Date().toISOString() };
        saveProject(p);
        continue;
      }
      if (provider === "muse-bridge") {
        setJob(id, { type: "auto", status: "running", step: "gambar", message: `Muse sedang membuat gambar scene ${i + 1}/${p.scenes.length} (bisa beberapa menit)...` });
        await generateImageViaBridge(promptFor(p, scene), path.join(projectDir(id), rel), p.aspect);
        p = loadProject(id);
        p.scenes[i].image = { status: "ready", file: rel, source: "muse-bridge", updatedAt: new Date().toISOString() };
        saveProject(p);
        continue;
      }
      if (provider === "venice") {
        await generateImageViaVenice(promptFor(p, scene), path.join(projectDir(id), rel), p.aspect);
        p = loadProject(id);
        p.scenes[i].image = { status: "ready", file: rel, source: "venice", updatedAt: new Date().toISOString() };
        saveProject(p);
        continue;
      }
      if (provider === "workers-ai") {
        await generateImageWorkersAI(promptFor(p, scene), path.join(projectDir(id), rel));
        p = loadProject(id);
        p.scenes[i].image = { status: "ready", file: rel, source: "workers-ai", updatedAt: new Date().toISOString() };
        saveProject(p);
        continue;
      }
      const seed = Math.floor(Math.random() * 1_000_000);
      await generateImage(promptFor(p, scene), path.join(projectDir(id), rel), seed, (waitSec, attempt) =>
        setJob(id, {
          type: "auto", status: "running", step: "gambar",
          message: `Pollinations membatasi permintaan; mencoba lagi (${attempt}) dalam ${waitSec} dtk...`,
        }), p.aspect
      );
      p = loadProject(id);
      p.scenes[i].image = { status: "ready", file: rel, seed, updatedAt: new Date().toISOString() };
      saveProject(p);
    }

    // 3) Voice over
    p = loadProject(id);
    for (let i = 0; i < p.scenes.length; i++) {
      const scene = p.scenes[i];
      if (scene.vo?.status === "ready" && !scene.vo.stale) continue;
      setJob(id, { type: "auto", status: "running", step: "vo", message: `Membuat voice over scene ${i + 1}/${p.scenes.length}...` });
      const rel = `vo/${scene.id}.mp3`;
      let duration;
      if ((p.executors.voProvider || "edge-tts") === "muse-bridge") {
        const voice = isClaudeVoice(p.executors.voice) ? p.executors.voice : defaultClaudeVoice();
        ({ duration } = await synthesizeClaude(scene.narration, voice, path.join(projectDir(id), rel), p.audience === "en" ? "en" : "id"));
        p = loadProject(id);
        p.scenes[i].vo = { status: "ready", file: rel, duration, source: "muse-bridge", updatedAt: new Date().toISOString() };
        saveProject(p);
        continue;
      }
      if ((p.executors.voProvider || "edge-tts") === "gemini-tts") {
        const voice = isGeminiVoice(p.executors.voice) ? p.executors.voice : defaultGeminiVoice();
        ({ duration } = await synthesizeGemini(scene.narration, voice, path.join(projectDir(id), rel)));
        p = loadProject(id);
        p.scenes[i].vo = { status: "ready", file: rel, duration, source: "gemini-tts", updatedAt: new Date().toISOString() };
        saveProject(p);
        continue;
      }
      if ((p.executors.voProvider || "edge-tts") === "elevenlabs") {
        const voice = isElevenLabsVoice(p.executors.voice) ? p.executors.voice : defaultElevenLabsVoice();
        ({ duration } = await synthesizeElevenLabs(scene.narration, voice, path.join(projectDir(id), rel)));
        p = loadProject(id);
        p.scenes[i].vo = { status: "ready", file: rel, duration, source: "elevenlabs", updatedAt: new Date().toISOString() };
        saveProject(p);
        continue;
      }
      ({ duration } = await synthesize(scene.narration, p.executors.voice, path.join(projectDir(id), rel)));
      p = loadProject(id);
      p.scenes[i].vo = { status: "ready", file: rel, duration, updatedAt: new Date().toISOString() };
      saveProject(p);
    }

    // Mode Flow: semua scene wajib sudah punya video unggahan sebelum rakit.
    if (p.engine === "slides" && p.visualSource === "flow") {
      const noClip = p.scenes.findIndex((s) => s.video?.status !== "ready");
      if (noClip >= 0) {
        throw new Error(`Scene ${noClip + 1} belum punya video Flow. Unggah dulu videonya di tahap 2, lalu jalankan otomatis lagi.`);
      }
    }

    // 4) Final render
    setJob(id, { type: "auto", status: "running", step: "rakit", message: "Merender video final..." });
    p = loadProject(id);
    const renderFn = p.engine === "stickman" ? renderStickman : p.engine === "darkcard" ? renderDarkcard : p.engine === "diagram" ? renderDiagram : p.engine === "editorial" ? renderEditorial : renderProject;
    const result = await renderFn(p, "final", (m) =>
      setJob(id, { type: "auto", status: "running", step: "rakit", message: m })
    );
    p = loadProject(id);
    p.renders.final = { status: "done", file: result.file, duration: result.duration, at: new Date().toISOString() };
    saveProject(p);
    setJob(id, { type: "auto", status: "done", step: "selesai", message: "Video final selesai." });
  } catch (e) {
    setJob(id, { type: "auto", status: "error", step: "gagal", message: String(e.message || e) });
    throw e;
  } finally {
    stopHeartbeat();
    activeJobs.delete(id);
  }
}
