import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { loadProject, saveProject, projectDir, sweepAssetDir } from "../../../../../../../lib/store.js";
import { generateImage, generateImageWorkersAI, generateImageVia9Router, generateImageViaBridge, generateImageViaVenice } from "../../../../../../../lib/ai.js";
import { slidesImagePrompt } from "../../../../../../../lib/visualStyles.js";
import { effectiveAppearance } from "../../../../../../../lib/characterIdentity.js";
import { REF_KINDS, effectiveReferences, mirrorLegacyPortrait, refFileRel, referencePromptFor } from "../../../../../../../lib/characterReferences.js";
import { activeSceneJobs, sceneJobKey, SCENE_JOB_STALE_MS } from "../../../../../../../lib/jobs.js";

export const dynamic = "force-dynamic";

// Reference Manager (CC1): himpunan referensi karakter — portrait,
// fullbody, expressions — di assets/characters/<cid>-<kind>.<ext>.
// Pola sama seperti route gambar karakter Fase A: unggah sinkron,
// generate async 202 dengan perlindungan anti-timpa unggahan, hapus
// per jenis. Generate bersifat BERANTAI: fullbody/expressions memakai
// portrait sebagai jangkar; di CC1 penurunannya adalah prompt teks
// yang diperkuat identity (derivedFrom dicatat dengan jujur) — jalur
// conditioning visual adalah pekerjaan adapter CC2.
function findCharacter(project, cid) {
  return (project.characters || []).find((c) => c.id === cid);
}

function withRefs(character) {
  character.references = effectiveReferences(character);
  character.referenceImage = mirrorLegacyPortrait(character.references);
  return character;
}

function refSeed(character) {
  return Number.isFinite(character?.seed) ? character.seed : Math.floor(Math.random() * 1000000);
}

async function produceReference(project, character, kind, providerOverride) {
  const provider = providerOverride || project.executors?.imageProvider || "pollinations";
  if (provider === "upload") {
    throw new Error("Penyedia gambar proyek ini 'unggah manual' — unggah berkas referensi untuk jenis ini.");
  }
  const rel = refFileRel(character.id, kind, "jpg");
  const abs = path.join(projectDir(project.id), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const refs = effectiveReferences(character);
  const derivedFrom = kind !== "portrait" && refs.portrait?.status === "ready" ? "portrait" : null;
  const pseudoScene = {
    imagePrompt: referencePromptFor(kind, character, effectiveAppearance(character)),
    sb: null,
  };
  const prompt = slidesImagePrompt(project, pseudoScene);
  let source = provider;
  if (provider === "pollinations") {
    const seed = refSeed(character);
    await generateImage(prompt, abs, seed, undefined, project.aspect);
    return { file: rel, source, seed, ...(derivedFrom ? { derivedFrom } : {}) };
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
  return { file: rel, source, ...(derivedFrom ? { derivedFrom } : {}) };
}

export async function GET(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  const character = findCharacter(project, params.cid);
  if (!character) return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  return NextResponse.json({
    references: effectiveReferences(character),
    kinds: REF_KINDS,
    seed: Number.isFinite(character.seed) ? character.seed : null,
  });
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
      const kind = String(form.get("kind") || "portrait");
      if (!REF_KINDS.includes(kind)) throw new Error("Jenis referensi tidak dikenal.");
      const file = form.get("file");
      if (!file || typeof file === "string") throw new Error("File tidak ada.");
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      sweepAssetDir(project.id, "assets/characters", `${character.id}-${kind}.`);
      const rel = refFileRel(character.id, kind, ext);
      const abs = path.join(projectDir(project.id), rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, Buffer.from(await file.arrayBuffer()));
      withRefs(character);
      character.references[kind] = { status: "ready", file: rel, source: "upload", updatedAt: new Date().toISOString() };
      character.referenceImage = mirrorLegacyPortrait(character.references);
      saveProject(project);
      return NextResponse.json({ project });
    }

    const body = await req.json().catch(() => ({}));
    const kind = String(body.kind || "portrait");
    if (!REF_KINDS.includes(kind)) {
      return NextResponse.json({ error: "Jenis referensi tidak dikenal." }, { status: 400 });
    }
    const key = sceneJobKey(project.id, character.id, "ref-" + kind);
    const runningAt = activeSceneJobs.get(key);
    if (runningAt && Date.now() - new Date(runningAt).getTime() < SCENE_JOB_STALE_MS) {
      return NextResponse.json({ project, started: false, generating: true });
    }
    withRefs(character);
    character.references[kind] = { status: "generating", startedAt: new Date().toISOString() };
    character.referenceImage = mirrorLegacyPortrait(character.references);
    saveProject(project);
    activeSceneJobs.set(key, new Date().toISOString());
    (async () => {
      try {
        const p = loadProject(project.id);
        const c = p && findCharacter(p, character.id);
        if (!p || !c) return;
        const made = await produceReference(p, c, kind, body.provider);
        const pf = loadProject(project.id);
        const cf = pf && findCharacter(pf, character.id);
        if (cf) {
          const refs = effectiveReferences(cf);
          if (refs[kind]?.status === "generating") {
            refs[kind] = { status: "ready", ...made, updatedAt: new Date().toISOString() };
            cf.references = refs;
            cf.referenceImage = mirrorLegacyPortrait(refs);
            saveProject(pf);
          }
        }
      } catch (e) {
        try {
          const pf = loadProject(project.id);
          const cf = pf && findCharacter(pf, character.id);
          if (cf) {
            const refs = effectiveReferences(cf);
            if (refs[kind]?.status === "generating") {
              refs[kind] = { status: "error", error: String(e.message || e), updatedAt: new Date().toISOString() };
              cf.references = refs;
              cf.referenceImage = mirrorLegacyPortrait(refs);
              saveProject(pf);
            }
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
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind || "");
  if (!REF_KINDS.includes(kind)) {
    return NextResponse.json({ error: "Jenis referensi tidak dikenal." }, { status: 400 });
  }
  sweepAssetDir(project.id, "assets/characters", `${character.id}-${kind}.`);
  // Portrait lama memakai nama "<cid>.<ext>": menghapus portrait juga
  // membersihkan berkas warisan itu supaya tidak bangkit lagi sebagai
  // portrait efektif.
  if (kind === "portrait") sweepAssetDir(project.id, "assets/characters", character.id + ".");
  withRefs(character);
  character.references[kind] = { status: "none" };
  character.referenceImage = mirrorLegacyPortrait(character.references);
  saveProject(project);
  return NextResponse.json({ project });
}
