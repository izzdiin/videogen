import { NextResponse } from "next/server";
import { loadProject } from "../../../../../lib/store.js";
import { runAuto } from "../../../../../lib/pipeline.js";
import { activeJobs } from "../../../../../lib/jobs.js";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
  if (activeJobs.has(project.id)) {
    return NextResponse.json({ error: "Sedang ada pekerjaan berjalan untuk proyek ini." }, { status: 409 });
  }
  runAuto(project.id).catch(() => {});
  return NextResponse.json({ started: true }, { status: 202 });
}
