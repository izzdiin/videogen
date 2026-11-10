import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { loadProject, saveProject, projectDir, sweepAssetDir } from "../../../../../lib/store.js";
import { buildThumbnail, THUMBNAIL_REL } from "../../../../../lib/thumbnail.js";
import { generateImage, generateImageWorkersAI, generateImageVia9Router, generateImageViaBridge, generateImageViaVenice } from "../../../../../lib/ai.js";

export const dynamic = "force-dynamic";

// Thumbnail paket sosmed: aset server di exports/thumbnail.jpg,
// metadata di project.social.thumbnail (pola aset server yang sama
// dengan gambar referensi karakter). Tiga cara membuat:
//   POST multipart  -> unggah gambar sendiri
//   POST {mode:"compose"} -> susun dari gambar proyek + judul (bawaan)
//   POST {mode:"generate", prompt} -> buat via penyedia gambar proyek
// DELETE menghapus thumbnail.
function ensureSocial(project) {
  if (!project.social || typeof project.social !== "object") {
    project.social = { caption: "", tags: [], thumbnail: { status: "none" }, updatedAt: "" };
  }
  if (!project.social.thumbnail) project.social.thumbnail = { status: "none" };
  return project.social;
}

export async function POST(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  ensureSocial(project);
  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") throw new Error("File tidak ada.");
      const abs = path.join(projectDir(project.id), THUMBNAIL_REL);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, Buffer.from(await file.arrayBuffer()));
      project.social.thumbnail = { status: "ready", file: THUMBNAIL_REL, source: "upload", updatedAt: new Date().toISOString() };
      saveProject(project);
      return NextResponse.json({ project });
    }
    const body = await req.json().catch(() => ({}));
    if (body.mode === "generate") {
      const provider = project.executors?.imageProvider || "pollinations";
      if (provider === "upload") {
        throw new Error("Penyedia gambar proyek ini 'unggah manual' — unggah berkas thumbnail atau susun dari gambar proyek.");
      }
      const prompt = String(body.prompt || "").trim() ||
        `eye-catching vertical video thumbnail artwork, bold composition, vivid colors, no text: ${project.title || project.theme || ""}`;
      const abs = path.join(projectDir(project.id), THUMBNAIL_REL);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      if (provider === "pollinations") {
        const seed = Math.floor(Math.random() * 1_000_000);
        await generateImage(prompt, abs, seed, undefined, project.aspect);
      } else if (provider === "workers-ai") {
        await generateImageWorkersAI(prompt, abs);
      } else if (provider === "muse-bridge") {
        await generateImageViaBridge(prompt, abs, project.aspect);
      } else if (provider === "venice") {
        await generateImageViaVenice(prompt, abs, project.aspect);
      } else {
        await generateImageVia9Router(prompt, abs, project.aspect);
      }
      project.social.thumbnail = { status: "ready", file: THUMBNAIL_REL, source: provider, updatedAt: new Date().toISOString() };
      saveProject(project);
      return NextResponse.json({ project });
    }
    // Bawaan: susun dari aset proyek yang sudah ada.
    project.social.thumbnail = await buildThumbnail(project, String(body.title || ""));
    saveProject(project);
    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 400 });
  }
}

export async function DELETE(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  ensureSocial(project);
  sweepAssetDir(project.id, "exports", "thumbnail.");
  project.social.thumbnail = { status: "none" };
  saveProject(project);
  return NextResponse.json({ project });
}
