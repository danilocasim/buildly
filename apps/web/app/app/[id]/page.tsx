// The workspace (TODO 5.2–5.7): chat on the left, preview on the right. Outside the shell:
// no sidebar. Loads the state server-side; the client then follows the project's stream.
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/src/server/current-user";
import { getDeps } from "@/src/server/deps";
import { loadWorkspace } from "@/src/server/workspace";
import { Workspace } from "@/src/ui/workspace/Workspace";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { id } = await params;
  const state = await loadWorkspace(getDeps().db, user.id, id);
  if (!state) notFound();
  return <Workspace initial={state} />;
}
