import { spawn } from "child_process";
import { Readable } from "stream";
import { loadProject, PROJECTS_DIR } from "../../../../../lib/store.js";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const project = loadProject(params.id);
  if (!project) return new Response("Not found", { status: 404 });
  const safeName = (project.title || "proyek").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "proyek";
  const tar = spawn("tar", ["-czf", "-", "-C", PROJECTS_DIR, params.id]);
  return new Response(Readable.toWeb(tar.stdout), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${safeName}-paket.tar.gz"`,
    },
  });
}
