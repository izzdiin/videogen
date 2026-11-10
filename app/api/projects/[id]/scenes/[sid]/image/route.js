import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { loadProject, saveProject, projectDir, imageRel, sweepAssetDir } from "../../../../../../../lib/store.js";
import { generateWithAdapter } from "../../../../../../../lib/imageAdapter.js";
import { b2ArtPrompt, b3ArtPrompt } from "../../../../../../../lib/stickman.js";
import { slidesImagePrompt } from "../../../../../../../lib/visualStyles.js";
import { editorialImagePrompt } from "../../../../../../../lib/editorial.js";
import { activeSceneJobs, sceneJobKey, SCENE_JOB_STALE_MS } from "../../../../../../../lib/jobs.js";

export const dynamic = "force-dynamic";

// Isi scene.image dengan gambar hasil generate, sesuai mesin & penyedia
// gambar proyek. Sejak CC2 semua jalur lewat Image Generation Adapter:
// mode conditioning (multi/img2img/teks) dipilih dari referensi karakter
// scene dan dicatat di scene.image.conditioning. Melempar Error bila
// gagal; penulisan status akhir ke project.json diatur pemanggil.
async function produceImage(project, scene, providerOverride) {
  if (!scene.imagePrompt?.trim()) throw new Error("Prompt gambar scene ini masih kosong.");
  const provider = providerOverride || project.executors.imageProvider || "pollinations";
  if (provider === "upload") {
    throw new Error("Penyedia gambar proyek ini 'unggah manual' — unggah berkas gambar untuk scene ini.");
  }
  const rel = imageRel(scene.id);
  const prompt =
    project.engine === "editorial"
      ? editorialImagePrompt(project, scene)
      : project.engine === "stickman" && ["B2", "B3"].includes(project.stickStyle || "B1")
        ? (project.stickStyle === "B3" ? b3ArtPrompt : b2ArtPrompt)(scene)
        : slidesImagePrompt(project, scene);
  const made = await generateWithAdapter({
    project,
    scene,
    prompt,
    destFile: path.join(projectDir(project.id), rel),
    providerOverride,
  });
  scene.image = {
    status: "ready",
    file: rel,
    ...(Number.isFinite(made.seed) ? { seed: made.seed } : {}),
    source: made.provider,
    conditioning: made.conditioning,
    updatedAt: new Date().toISOString(),
  };
}

export async function POST(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  const scene = project.scenes.find((s) => s.id === params.sid);
  if (!scene) return NextResponse.json({ error: "Scene tidak ditemukan." }, { status: 404 });

  const dir = path.join(projectDir(project.id), "assets", "images");
  fs.mkdirSync(dir, { recursive: true });
  const clearOld = () => {
    sweepAssetDir(project.id, "assets/images", scene.id + ".");
    sweepAssetDir(project.id, "stills", scene.id + ".");
  };

  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") throw new Error("File tidak ada.");
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      clearOld();
      const rel = `assets/images/${scene.id}.${ext}`;
      fs.writeFileSync(path.join(projectDir(project.id), rel), Buffer.from(await file.arrayBuffer()));
      scene.image = { status: "ready", file: rel, source: "upload", updatedAt: new Date().toISOString() };
      saveProject(project);
      return NextResponse.json({ project });
    }

    // Jalur generate (JSON): pembuatan bisa makan waktu menit (khususnya
    // muse-bridge), jadi pekerjaan dijalankan di latar belakang proses
    // server dan handler kembali segera. Dulu handler menunggu sampai
    // selesai, sehingga koneksi HTTP yang putus di tengah membuat UI
    // menampilkan "Failed to fetch" padahal gambar tetap dibuat server.
    // Kini klien memantau status scene.image: generating → ready/error.
    const body = await req.json().catch(() => ({}));
    const IMG_PROVIDERS = ["pollinations", "sdxl-9router", "workers-ai", "muse-bridge", "venice", "upload"];
    const providerOverride = IMG_PROVIDERS.includes(body.provider) ? body.provider : null;
    if (!scene.imagePrompt?.trim()) throw new Error("Prompt gambar scene ini masih kosong.");
    if ((providerOverride || project.executors.imageProvider || "pollinations") === "upload") {
      throw new Error("Penyedia gambar scene ini 'unggah manual' — unggah berkas gambar untuk scene ini.");
    }
    const key = sceneJobKey(project.id, scene.id, "image");
    const runningAt = activeSceneJobs.get(key);
    if (runningAt && Date.now() - new Date(runningAt).getTime() < SCENE_JOB_STALE_MS) {
      return NextResponse.json({ project, started: false, generating: true });
    }
    scene.image = { status: "generating", startedAt: new Date().toISOString() };
    saveProject(project);
    activeSceneJobs.set(key, new Date().toISOString());
    (async () => {
      try {
        const p = loadProject(project.id);
        const s = p?.scenes.find((x) => x.id === scene.id);
        if (!p || !s) return;
        await produceImage(p, s, providerOverride);
        const pf = loadProject(project.id);
        const sf = pf?.scenes.find((x) => x.id === scene.id);
        // Tulis hasil hanya bila status masih "generating": unggahan
        // manual di tengah jalan tidak boleh tertimpa hasil generate.
        if (sf && sf.image?.status === "generating") {
          sf.image = s.image;
          saveProject(pf);
        }
      } catch (e) {
        try {
          const pf = loadProject(project.id);
          const sf = pf?.scenes.find((x) => x.id === scene.id);
          if (sf && sf.image?.status === "generating") {
            sf.image = { status: "error", error: String(e.message || e), updatedAt: new Date().toISOString() };
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
