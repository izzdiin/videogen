import { NextResponse } from "next/server";
import { createProject, listProjects } from "../../../lib/store.js";
import { runAuto } from "../../../lib/pipeline.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ projects: listProjects() });
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const project = createProject(body);
  if (body.mode === "auto") {
    runAuto(project.id).catch(() => {});
  }
  return NextResponse.json({ project }, { status: 201 });
}
