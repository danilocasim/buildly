// The workspace (TODO 5.2–5.7): chat on the left, preview on the right. Outside the shell:
// no sidebar. Loads the state server-side; the client then follows the project's stream.
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/src/server/current-user";
import { getDeps } from "@/src/server/deps";
import { trackProjectOpened } from "@/src/server/handlers/projects";
import { loadWorkspace } from "@/src/server/workspace";
import { Workspace } from "@/src/ui/workspace/Workspace";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { id } = await params;
  const { tab } = await searchParams;
  const deps = getDeps();
  const state = await loadWorkspace(deps.db, deps.storage, user.id, id);
  if (!state) notFound();
  await trackProjectOpened(deps, user.id, id);
  return <Workspace initial={state} initialTab={tab === "code" ? "code" : "preview"} />;
}
