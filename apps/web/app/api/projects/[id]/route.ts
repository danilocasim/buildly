import { getDeps } from "@/src/server/deps";
import { getProject } from "@/src/server/handlers/projects";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return getProject(request, getDeps(), (await params).id);
}
