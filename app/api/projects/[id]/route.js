import { NextResponse } from "next/server";
import { loadProject, saveProject, deleteProject, mergeScenes } from "../../../../lib/store.js";
import { VISUAL_STYLE_IDS } from "../../../../lib/visualStyles.js";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.title === "string") project.title = body.title;
  if (typeof body.theme === "string") project.theme = body.theme;
  if (typeof body.style === "string") project.style = body.style;
  if (body.executors && typeof body.executors === "object") {
    project.executors = { ...project.executors, ...body.executors };
  }
  if (body.darkcard && typeof body.darkcard === "object") {
    const cur = project.darkcard || { watermark: "", accent: "#F26D8D" };
    if (typeof body.darkcard.watermark === "string") cur.watermark = body.darkcard.watermark.slice(0, 80);
    if (/^#[0-9a-fA-F]{6}$/.test(body.darkcard.accent || "")) cur.accent = body.darkcard.accent;
    project.darkcard = cur;
  }
  if (body.diagram && typeof body.diagram === "object") {
    const cur = project.diagram || { watermark: "", accent: "#E4572E", theme: "light" };
    if (typeof body.diagram.watermark === "string") cur.watermark = body.diagram.watermark.slice(0, 80);
    if (/^#[0-9a-fA-F]{6}$/.test(body.diagram.accent || "")) cur.accent = body.diagram.accent;
    if (["light", "dark"].includes(body.diagram.theme)) cur.theme = body.diagram.theme;
    project.diagram = cur;
  }
  if (body.editorial && typeof body.editorial === "object") {
    const cur = project.editorial || { watermark: "", accent: "#E94F1E" };
    if (typeof body.editorial.watermark === "string") cur.watermark = body.editorial.watermark.slice(0, 80);
    if (/^#[0-9a-fA-F]{6}$/.test(body.editorial.accent || "")) cur.accent = body.editorial.accent;
    project.editorial = cur;
  }
  if (["B1", "B2", "B3"].includes(body.stickStyle)) project.stickStyle = body.stickStyle;
  if (VISUAL_STYLE_IDS.includes(body.visualStyle)) project.visualStyle = body.visualStyle;
  if (Array.isArray(body.scenes)) mergeScenes(project, body.scenes);
  saveProject(project);
  return NextResponse.json({ project });
}

export async function DELETE(req, { params }) {
  deleteProject(params.id);
  return NextResponse.json({ ok: true });
}
