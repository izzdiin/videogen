import fs from "fs";
import path from "path";
import { loadProject, saveProject, blankScene, projectDir, resolveSceneVisual, imageRel, sceneVoRel, POLL_VO_REL } from "./store.js";
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
import { transcribeSceneWords } from "./asr.js";
import { postMixProject } from "./audio.js";

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
      p.script = { generatedAt: new Date().toISOString(), model: p.executors.scriptModel, source: "auto", scenes };
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
    if (p.engine === "slides" || p.engine === "editorial") for (let i = 0; i < p.scenes.length; i++) {
      const scene = p.scenes[i];
      // Scene Slides yang visual rakitnya klip Flow tidak dibuatkan gambar.
      if (p.engine === "slides" && (resolveSceneVisual(scene) === "video" || scene.visualChoice === "video")) continue;
      if (scene.image?.status === "ready" && !scene.image.stale) continue;
      setJob(id, { type: "auto", status: "running", step: "gambar", message: `Membuat gambar scene ${i + 1}/${p.scenes.length}...` });
      const rel = imageRel(scene.id);
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
      const rel = sceneVoRel(scene.id);
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

    // VO kartu polling penutup (Slides): dibuat dari teks VO polling
    // bila kartu aktif dan teksnya terisi, memakai eksekutor VO proyek.
    p = loadProject(id);
    if (
      p.engine === "slides" &&
      String(p.poll?.question || "").trim() &&
      (p.poll?.options || []).filter((o) => String(o || "").trim()).length >= 2 &&
      String(p.poll?.voText || "").trim() &&
      p.poll?.vo?.status !== "ready"
    ) {
      setJob(id, { type: "auto", status: "running", step: "vo", message: "Membuat voice over kartu polling..." });
      const rel = POLL_VO_REL;
      const abs = path.join(projectDir(id), rel);
      const text = p.poll.voText;
      let duration;
      if ((p.executors.voProvider || "edge-tts") === "muse-bridge") {
        const voice = isClaudeVoice(p.executors.voice) ? p.executors.voice : defaultClaudeVoice();
        ({ duration } = await synthesizeClaude(text, voice, abs, p.audience === "en" ? "en" : "id"));
      } else if ((p.executors.voProvider || "edge-tts") === "gemini-tts") {
        const voice = isGeminiVoice(p.executors.voice) ? p.executors.voice : defaultGeminiVoice();
        ({ duration } = await synthesizeGemini(text, voice, abs));
      } else if ((p.executors.voProvider || "edge-tts") === "elevenlabs") {
        const voice = isElevenLabsVoice(p.executors.voice) ? p.executors.voice : defaultElevenLabsVoice();
        ({ duration } = await synthesizeElevenLabs(text, voice, abs));
      } else {
        ({ duration } = await synthesize(text, p.executors.voice, abs));
      }
      p = loadProject(id);
      p.poll.vo = { status: "ready", file: rel, duration, source: p.executors.voProvider || "edge-tts", updatedAt: new Date().toISOString() };
      saveProject(p);
    }

    // Semua scene Slides wajib punya visual siap rakit (gambar atau klip
    // Flow, mengikuti pilihan per scene) sebelum tahap rakit.
    if (p.engine === "slides") {
      const noVis = p.scenes.findIndex((s) => resolveSceneVisual(s) === null);
      if (noVis >= 0) {
        throw new Error(p.scenes[noVis].visualChoice === "video"
          ? `Scene ${noVis + 1} belum punya video Flow. Unggah dulu videonya di tahap 2, lalu jalankan otomatis lagi.`
          : `Scene ${noVis + 1} belum punya gambar latar atau video Flow.`);
      }
    }

    // 3b) Timestamp kata ASR (Fase D): untuk gaya caption berbasis
    // kata, transkripsikan VO tiap scene. Kegagalan TIDAK menghenti-
    // kan pipeline — renderer jatuh ke estimasi karakter.
    p = loadProject(id);
    if (p.engine === "slides" && ["karaoke", "dynamic", "satukata"].includes(p.captionStyle || "frasa")) {
      for (let i = 0; i < p.scenes.length; i++) {
        const scene = p.scenes[i];
        if (scene.words?.status === "ready" || scene.vo?.status !== "ready" || !scene.vo.file) continue;
        setJob(id, { type: "auto", status: "running", step: "vo", message: `Transkrip timestamp kata scene ${i + 1}/${p.scenes.length}...` });
        try {
          const { items, model } = await transcribeSceneWords(path.join(projectDir(id), scene.vo.file), scene.narration);
          p = loadProject(id);
          p.scenes[i].words = { status: "ready", source: "asr-gemini", model, items, updatedAt: new Date().toISOString() };
          saveProject(p);
        } catch (e) {
          p = loadProject(id);
          p.scenes[i].words = { status: "error", error: String(e.message || e).slice(0, 300), updatedAt: new Date().toISOString() };
          saveProject(p);
        }
      }
    }

    // 4) Final render
    setJob(id, { type: "auto", status: "running", step: "rakit", message: "Merender video final..." });
    p = loadProject(id);
    const renderFn = p.engine === "stickman" ? renderStickman : p.engine === "darkcard" ? renderDarkcard : p.engine === "diagram" ? renderDiagram : p.engine === "editorial" ? renderEditorial : renderProject;
    const result = await renderFn(p, "final", (m) =>
      setJob(id, { type: "auto", status: "running", step: "rakit", message: m })
    );
    // Mix akhir Audio Studio untuk mesin selain Slides (Slides
    // mencampur di dalam renderernya sendiri).
    await postMixProject(loadProject(id), "final", result, (m) =>
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
