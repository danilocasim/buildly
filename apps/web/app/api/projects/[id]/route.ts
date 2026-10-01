import { getDeps } from "@/src/server/deps";
import { getProject, renameProject } from "@/src/server/handlers/projects";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return getProject(request, getDeps(), (await params).id);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return renameProject(request, getDeps(), (await params).id);
}
