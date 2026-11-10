import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { loadProject, saveProject, projectDir, sweepAssetDir } from "../../../../../../../lib/store.js";
import { generateImage, generateImageWorkersAI, generateImageVia9Router, generateImageViaBridge, generateImageViaVenice } from "../../../../../../../lib/ai.js";
import { slidesImagePrompt } from "../../../../../../../lib/visualStyles.js";
import { activeSceneJobs, sceneJobKey, SCENE_JOB_STALE_MS } from "../../../../../../../lib/jobs.js";

export const dynamic = "force-dynamic";

// Gambar referensi karakter (Fase A, butir 2): satu gambar per karakter
// di assets/characters/<cid>.<ext> — jangkar visual character sheet.
// Generate berjalan async seperti generate gambar per scene; unggahan
// manual menggantikannya; hasil generate tidak menimpa unggahan yang
// masuk di tengah jalan.
function findCharacter(project, cid) {
  return (project.characters || []).find((c) => c.id === cid);
}

async function produceCharacterImage(project, character, providerOverride) {
  const provider = providerOverride || project.executors?.imageProvider || "pollinations";
  if (provider === "upload") {
    throw new Error("Penyedia gambar proyek ini 'unggah manual' — unggah berkas gambar referensi untuk karakter ini.");
  }
  const rel = `assets/characters/${character.id}.jpg`;
  const abs = path.join(projectDir(project.id), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const pseudoScene = {
    imagePrompt: `character reference portrait: ${character.appearance || character.name}, upper body, facing the camera, neutral expression, plain neutral background, clear detailed face`,
    sb: null,
  };
  const prompt = slidesImagePrompt(project, pseudoScene);
  let source = provider;
  if (provider === "pollinations") {
    const seed = Math.floor(Math.random() * 1_000_000);
    await generateImage(prompt, abs, seed, undefined, project.aspect);
    return { file: rel, source, seed };
  }
  if (provider === "sdxl-9router") {
    await generateImageVia9Router(prompt, abs, project.aspect);
  } else if (provider === "muse-bridge") {
    await generateImageViaBridge(prompt, abs, project.aspect);
  } else if (provider === "venice") {
    await generateImageViaVenice(prompt, abs, project.aspect);
  } else if (provider === "workers-ai") {
    await generateImageWorkersAI(prompt, abs);
  } else {
    source = "sdxl-9router";
    await generateImageVia9Router(prompt, abs, project.aspect);
  }
  return { file: rel, source };
}

export async function POST(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  const character = findCharacter(project, params.cid);
  if (!character) return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });

  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") throw new Error("File tidak ada.");
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      sweepAssetDir(project.id, "assets/characters", character.id + ".");
      const rel = `assets/characters/${character.id}.${ext}`;
      const abs = path.join(projectDir(project.id), rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, Buffer.from(await file.arrayBuffer()));
      character.referenceImage = { status: "ready", file: rel, source: "upload", updatedAt: new Date().toISOString() };
      saveProject(project);
      return NextResponse.json({ project });
    }

    const body = await req.json().catch(() => ({}));
    const key = sceneJobKey(project.id, character.id, "charimg");
    const runningAt = activeSceneJobs.get(key);
    if (runningAt && Date.now() - new Date(runningAt).getTime() < SCENE_JOB_STALE_MS) {
      return NextResponse.json({ project, started: false, generating: true });
    }
    character.referenceImage = { status: "generating", startedAt: new Date().toISOString() };
    saveProject(project);
    activeSceneJobs.set(key, new Date().toISOString());
    (async () => {
      try {
        const p = loadProject(project.id);
        const c = p && findCharacter(p, character.id);
        if (!p || !c) return;
        const made = await produceCharacterImage(p, c, body.provider);
        const pf = loadProject(project.id);
        const cf = pf && findCharacter(pf, character.id);
        if (cf && cf.referenceImage?.status === "generating") {
          cf.referenceImage = { status: "ready", ...made, updatedAt: new Date().toISOString() };
          saveProject(pf);
        }
      } catch (e) {
        try {
          const pf = loadProject(project.id);
          const cf = pf && findCharacter(pf, character.id);
          if (cf && cf.referenceImage?.status === "generating") {
            cf.referenceImage = { status: "error", error: String(e.message || e), updatedAt: new Date().toISOString() };
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
  const character = findCharacter(project, params.cid);
  if (!character) return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  sweepAssetDir(project.id, "assets/characters", character.id + ".");
  character.referenceImage = { status: "none" };
  saveProject(project);
  return NextResponse.json({ project });
}
