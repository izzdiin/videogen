import { NextResponse } from "next/server";
import { loadProject, saveProject } from "../../../../../lib/store.js";
import { renderProject } from "../../../../../lib/render.js";
import { renderStickman, ensureStickmanProps } from "../../../../../lib/stickman.js";
import { renderDarkcard } from "../../../../../lib/darkcard.js";
import { renderDiagram } from "../../../../../lib/diagram.js";
import { renderEditorial } from "../../../../../lib/editorial.js";
import { activeJobs, startJobHeartbeat } from "../../../../../lib/jobs.js";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const kind = body.kind === "draft" ? "draft" : "final";
  if (project.scenes.length === 0) {
    return NextResponse.json({ error: "Belum ada scene." }, { status: 400 });
  }
  if (project.engine === "stickman" || project.engine === "darkcard" || project.engine === "diagram" || project.engine === "editorial") {
    const noVo = project.scenes.findIndex((s) => s.vo?.status !== "ready");
    if (noVo >= 0) {
      return NextResponse.json(
        { error: `Scene ${noVo + 1} belum punya voice over.` },
        { status: 400 }
      );
    }
  }
  if (project.engine !== "stickman" && project.engine !== "darkcard" && project.engine !== "diagram") {
    const missing = project.scenes.findIndex((s) => s.image?.status !== "ready");
    if (missing >= 0) {
      return NextResponse.json(
        { error: `Scene ${missing + 1} belum punya gambar latar.` },
        { status: 400 }
      );
    }
  }
  if (activeJobs.has(project.id)) {
    return NextResponse.json({ error: "Sedang ada pekerjaan berjalan untuk proyek ini." }, { status: 409 });
  }

  activeJobs.add(project.id);
  project.renders[kind] = { status: "running", at: new Date().toISOString() };
  project.job = { type: "render", status: "running", step: "rakit", message: `Merender ${kind}...`, at: new Date().toISOString() };
  saveProject(project);

  const stopHeartbeat = startJobHeartbeat(project.id, loadProject, saveProject);
  (async () => {
    try {
      let fresh = loadProject(project.id);
      if (fresh.engine === "stickman") {
        fresh = await ensureStickmanProps(fresh, (m) => {
          const p = loadProject(project.id);
          if (p) {
            p.job = { type: "render", status: "running", step: "rakit", message: m, at: new Date().toISOString() };
            saveProject(p);
          }
        });
      }
      const renderFn = fresh.engine === "stickman" ? renderStickman : fresh.engine === "darkcard" ? renderDarkcard : fresh.engine === "diagram" ? renderDiagram : fresh.engine === "editorial" ? renderEditorial : renderProject;
      const result = await renderFn(fresh, kind, (m) => {
        const p = loadProject(project.id);
        if (p) {
          p.job = { type: "render", status: "running", step: "rakit", message: m, at: new Date().toISOString() };
          saveProject(p);
        }
      });
      const p = loadProject(project.id);
      p.renders[kind] = { status: "done", file: result.file, duration: result.duration, at: new Date().toISOString() };
      p.job = { type: "render", status: "done", step: "selesai", message: `Render ${kind} selesai.`, at: new Date().toISOString() };
      saveProject(p);
    } catch (e) {
      const p = loadProject(project.id);
      if (p) {
        p.renders[kind] = { status: "error", message: String(e.message || e), at: new Date().toISOString() };
        p.job = { type: "render", status: "error", step: "gagal", message: String(e.message || e), at: new Date().toISOString() };
        saveProject(p);
      }
    } finally {
      stopHeartbeat();
      activeJobs.delete(project.id);
    }
  })();

  return NextResponse.json({ started: true, kind }, { status: 202 });
}
