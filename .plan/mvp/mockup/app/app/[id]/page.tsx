import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace/Workspace";
import { projects, starters, type Project } from "@/lib/mock";

const icons = { journal: "file", "habit-tracker": "book", inventory: "box" } as const;

function resolveProject(id: string): Project | null {
  const existing = projects.find((p) => p.id === id);
  if (existing) return existing;
  const starter = starters.find((s) => s.slug === id);
  if (starter) return { id, name: starter.name, icon: icons[starter.slug], updatedAgo: "just now", starter: starter.slug };
  return null;
}

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** Deep-linkable states so every screen can be captured or shared: ?building=1, ?tab=code, ?phone=1, ?history=1 */
  searchParams: Promise<{ building?: string; tab?: string; phone?: string; history?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const project = resolveProject(id);
  if (!project) notFound();
  return (
    <Workspace
      project={project}
      startBuilding={q.building === "1"}
      initial={{ tab: q.tab === "code" ? "code" : "preview", phoneOpen: q.phone === "1", historyOpen: q.history === "1" }}
    />
  );
}
