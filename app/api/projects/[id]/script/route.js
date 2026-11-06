import { NextResponse } from "next/server";
import { loadProject, saveProject, blankScene } from "../../../../../lib/store.js";
import { generateScript } from "../../../../../lib/ai.js";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const model = body.model || project.executors.scriptModel;
  if (!model) {
    return NextResponse.json(
      { error: "Model naskah belum dipilih. Isi dulu di bagian Eksekutor." },
      { status: 400 }
    );
  }
  try {
    const scenes = await generateScript(project, model);
    const mapped = scenes.map((s, i) => {
      const old = project.scenes[i];
      const base = old ? { ...old } : blankScene();
      const next = { ...base, ...s };
      if (old) {
        if (old.narration !== next.narration && next.vo?.status === "ready") {
          next.vo = { ...next.vo, stale: true };
        }
        if (old.imagePrompt !== next.imagePrompt && next.image?.status === "ready") {
          next.image = { ...next.image, stale: true };
        }
      }
      return next;
    });
    project.scenes = mapped;
    saveProject(project);
    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
