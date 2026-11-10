import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { NextResponse } from "next/server";
import { loadProject, saveProject, projectDir, sweepAssetDir, layerRel } from "../../../../../../../lib/store.js";
import { sanitizeLayerMotion } from "../../../../../../../lib/motion.js";
import { generateImage, generateImageWorkersAI, generateImageVia9Router, generateImageViaBridge, generateImageViaVenice } from "../../../../../../../lib/ai.js";
import { activeSceneJobs, sceneJobKey, SCENE_JOB_STALE_MS } from "../../../../../../../lib/jobs.js";

const execFileP = promisify(execFile);
export const dynamic = "force-dynamic";

// Layer objek alpha per scene (Fase B/D4): satu PNG transparan yang
// dirender bergerak di atas latar. Dua sumber: unggahan PNG/WebP
// ber-alpha milik pengguna, atau generate dari prompt — objek dibuat
// di atas latar hijau pekat lalu kuncinya dibuang (chromakey+despill)
// menjadi PNG alpha. Generate berjalan async seperti gambar scene.
function findScene(project, sid) {
  return (project.scenes || []).find((s) => s.id === sid);
}

async function cutout(srcAbs, outAbs) {
  const tries = [
    "chromakey=0x00FF00:0.30:0.10,despill=type=green,format=rgba",
    "chromakey=0x00FF00:0.30:0.10,format=rgba",
  ];
  let lastErr = null;
  for (const vf of tries) {
    try {
      await execFileP("ffmpeg", ["-y", "-i", srcAbs, "-vf", vf, "-frames:v", "1", outAbs], { timeout: 120000 });
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("Cutout chromakey gagal: " + String(lastErr?.stderr || lastErr?.message || lastErr).slice(-260));
}

async function produceLayer(project, scene, prompt, providerOverride) {
  const provider = providerOverride || project.executors?.imageProvider || "pollinations";
  if (provider === "upload") {
    throw new Error("Penyedia gambar proyek ini 'unggah manual' — unggah berkas PNG transparan untuk layer scene ini.");
  }
  const srcRel = `assets/images/layer-${scene.id}-src.jpg`;
  const srcAbs = path.join(projectDir(project.id), srcRel);
  fs.mkdirSync(path.dirname(srcAbs), { recursive: true });
  const fullPrompt = `${prompt}, single object isolated in the center of the frame on a solid pure green background (#00FF00), the whole object visible with margin around it, no shadow, no ground plane, no text`;
  if (provider === "pollinations") {
    await generateImage(fullPrompt, srcAbs, Math.floor(Math.random() * 1_000_000), undefined, "1:1");
  } else if (provider === "sdxl-9router") {
    await generateImageVia9Router(fullPrompt, srcAbs, "1:1");
  } else if (provider === "muse-bridge") {
    await generateImageViaBridge(fullPrompt, srcAbs, "1:1");
  } else if (provider === "venice") {
    await generateImageViaVenice(fullPrompt, srcAbs, "1:1");
  } else if (provider === "workers-ai") {
    await generateImageWorkersAI(fullPrompt, srcAbs);
  } else {
    await generateImageVia9Router(fullPrompt, srcAbs, "1:1");
  }
  const outAbs = path.join(projectDir(project.id), layerRel(scene.id));
  await cutout(srcAbs, outAbs);
  fs.rmSync(srcAbs, { force: true });
  return { file: layerRel(scene.id), source: provider };
}

export async function POST(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  const scene = findScene(project, params.sid);
  if (!scene) return NextResponse.json({ error: "Scene tidak ditemukan." }, { status: 404 });
  scene.layer = scene.layer || { status: "none" };

  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") throw new Error("File tidak ada.");
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      sweepAssetDir(project.id, "assets/images", `layer-${scene.id}`);
      const rel = `assets/images/layer-${scene.id}.${ext}`;
      const abs = path.join(projectDir(project.id), rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, Buffer.from(await file.arrayBuffer()));
      scene.layer = { status: "ready", file: rel, source: "upload", updatedAt: new Date().toISOString() };
      saveProject(project);
      return NextResponse.json({ project });
    }

    const body = await req.json().catch(() => ({}));
    const prompt = String(body.prompt || "").trim();
    if (!prompt) throw new Error("Prompt objek layer wajib diisi untuk generate.");
    const key = sceneJobKey(project.id, scene.id, "layer");
    const runningAt = activeSceneJobs.get(key);
    if (runningAt && Date.now() - new Date(runningAt).getTime() < SCENE_JOB_STALE_MS) {
      return NextResponse.json({ project, started: false, generating: true });
    }
    scene.layer = { status: "generating", startedAt: new Date().toISOString() };
    saveProject(project);
    activeSceneJobs.set(key, new Date().toISOString());
    (async () => {
      try {
        const made = await produceLayer(project, scene, prompt, body.provider);
        const pf = loadProject(project.id);
        const sf = pf && findScene(pf, scene.id);
        if (sf && sf.layer?.status === "generating") {
          sf.layer = { status: "ready", ...made, prompt, updatedAt: new Date().toISOString() };
          saveProject(pf);
        }
      } catch (e) {
        try {
          const pf = loadProject(project.id);
          const sf = pf && findScene(pf, scene.id);
          if (sf && sf.layer?.status === "generating") {
            sf.layer = { status: "error", error: String(e.message || e), updatedAt: new Date().toISOString() };
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

export async function PATCH(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  const scene = findScene(project, params.sid);
  if (!scene) return NextResponse.json({ error: "Scene tidak ditemukan." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (body.layerMotion !== undefined) scene.layerMotion = sanitizeLayerMotion(body.layerMotion);
  saveProject(project);
  return NextResponse.json({ project });
}

export async function DELETE(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  const scene = findScene(project, params.sid);
  if (!scene) return NextResponse.json({ error: "Scene tidak ditemukan." }, { status: 404 });
  sweepAssetDir(project.id, "assets/images", `layer-${scene.id}`);
  scene.layer = { status: "none" };
  saveProject(project);
  return NextResponse.json({ project });
}
