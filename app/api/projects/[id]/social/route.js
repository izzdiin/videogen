import { NextResponse } from "next/server";
import { loadProject, saveProject } from "../../../../../lib/store.js";
import { draftSocialPackage } from "../../../../../lib/socialDraft.js";

export const dynamic = "force-dynamic";

// Susun draf caption + tagar paket sosmed dari konteks proyek lewat
// model naskah. Hasilnya disimpan ke project.social (thumbnail aset
// server tidak disentuh). Draf boleh ditimpa kapan pun — user mengedit
// lewat PATCH proyek seperti biasa.
export async function POST(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  try {
    const draft = await draftSocialPackage(project, String(body.model || ""));
    const cur = project.social || { caption: "", tags: [], thumbnail: { status: "none" }, updatedAt: "" };
    project.social = {
      caption: draft.caption,
      tags: draft.tags,
      thumbnail: cur.thumbnail || { status: "none" },
      updatedAt: new Date().toISOString(),
    };
    saveProject(project);
    return NextResponse.json({ project, modelDipakai: draft.modelDipakai });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
