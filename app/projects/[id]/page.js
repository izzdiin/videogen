import { notFound } from "next/navigation";
import { loadProject } from "../../../lib/store.js";
import ProjectWizard from "../../ProjectWizard.js";

export const dynamic = "force-dynamic";

export default function ProjectPage({ params }) {
  const project = loadProject(params.id);
  if (!project) notFound();
  return <ProjectWizard initial={project} />;
}
