import { NextResponse } from "next/server";
import { loadProject, saveProject, blankScene } from "../../../../../lib/store.js";

export const dynamic = "force-dynamic";

export async function PUT(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const oldById = new Map((project.scenes || []).map((s) => [s.id, s]));
  project.scenes = (body.scenes || []).map((s) => {
    const old = s.id ? oldById.get(s.id) : null;
    if (!old) return { ...blankScene(), ...s, image: { status: "empty" }, vo: { status: "empty" } };
    const narrationChanged = (old.narration || "") !== (s.narration || "");
    const promptChanged = (old.imagePrompt || "") !== (s.imagePrompt || "");
    return {
      ...old,
      title: s.title ?? old.title,
      narration: s.narration ?? old.narration,
      overlay: s.overlay ?? old.overlay,
      subtitle: s.subtitle ?? old.subtitle,
      imagePrompt: s.imagePrompt ?? old.imagePrompt,
      stick: s.stick !== undefined ? s.stick : old.stick ?? null,
      image: promptChanged && old.image?.file ? { ...old.image, status: "stale" } : old.image,
      vo: narrationChanged && old.vo?.file ? { ...old.vo, status: "stale" } : old.vo,
    };
  });
  saveProject(project);
  return NextResponse.json({ project });
}

export async function POST(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  project.scenes.push(blankScene());
  saveProject(project);
  return NextResponse.json({ project }, { status: 201 });
}
