import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { loadProject, saveProject, projectDir } from "../../../../../../../lib/store.js";
import { generateImage, generateImageWorkersAI, generateImageVia9Router, generateImageViaBridge } from "../../../../../../../lib/ai.js";
import { b2ArtPrompt, b3ArtPrompt } from "../../../../../../../lib/stickman.js";
import { slidesImagePrompt } from "../../../../../../../lib/visualStyles.js";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  const scene = project.scenes.find((s) => s.id === params.sid);
  if (!scene) return NextResponse.json({ error: "Scene tidak ditemukan." }, { status: 404 });

  const dir = path.join(projectDir(project.id), "stills");
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
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      clearOld();
      const rel = `stills/${scene.id}.${ext}`;
      fs.writeFileSync(path.join(projectDir(project.id), rel), Buffer.from(await file.arrayBuffer()));
      scene.image = { status: "ready", file: rel, source: "upload", updatedAt: new Date().toISOString() };
    } else {
      if (!scene.imagePrompt?.trim()) throw new Error("Prompt gambar scene ini masih kosong.");
      const provider = project.executors.imageProvider || "pollinations";
      if (provider === "upload") {
        throw new Error("Penyedia gambar proyek ini 'unggah manual' — unggah berkas gambar untuk scene ini.");
      }
      const rel = `stills/${scene.id}.jpg`;
      if (project.engine === "stickman" && ["B2", "B3"].includes(project.stickStyle || "B1")) {
        const artPrompt = project.stickStyle === "B3" ? b3ArtPrompt : b2ArtPrompt;
        if (provider === "pollinations") {
          const seed = Math.floor(Math.random() * 1_000_000);
          await generateImage(artPrompt(scene), path.join(projectDir(project.id), rel), seed, undefined, project.aspect);
          scene.image = { status: "ready", file: rel, seed, source: "pollinations", updatedAt: new Date().toISOString() };
        } else if (provider === "muse-bridge") {
          await generateImageViaBridge(artPrompt(scene), path.join(projectDir(project.id), rel), project.aspect);
          scene.image = { status: "ready", file: rel, source: "muse-bridge", updatedAt: new Date().toISOString() };
        } else {
          await generateImageVia9Router(artPrompt(scene), path.join(projectDir(project.id), rel), project.aspect);
          scene.image = { status: "ready", file: rel, source: "sdxl-9router", updatedAt: new Date().toISOString() };
        }
      } else if (provider === "sdxl-9router") {
        await generateImageVia9Router(slidesImagePrompt(project, scene), path.join(projectDir(project.id), rel), project.aspect);
        scene.image = { status: "ready", file: rel, source: "sdxl-9router", updatedAt: new Date().toISOString() };
      } else if (provider === "muse-bridge") {
        await generateImageViaBridge(slidesImagePrompt(project, scene), path.join(projectDir(project.id), rel), project.aspect);
        scene.image = { status: "ready", file: rel, source: "muse-bridge", updatedAt: new Date().toISOString() };
      } else if (provider === "workers-ai") {
        await generateImageWorkersAI(slidesImagePrompt(project, scene), path.join(projectDir(project.id), rel));
        scene.image = { status: "ready", file: rel, source: "workers-ai", updatedAt: new Date().toISOString() };
      } else {
        const seed = Math.floor(Math.random() * 1_000_000);
        await generateImage(slidesImagePrompt(project, scene), path.join(projectDir(project.id), rel), seed, undefined, project.aspect);
        scene.image = { status: "ready", file: rel, seed, source: "pollinations", updatedAt: new Date().toISOString() };
      }
    }
    saveProject(project);
    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
