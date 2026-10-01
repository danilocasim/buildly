import { getDeps } from "@/src/server/deps";
import { exportProject } from "@/src/server/handlers/export";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return exportProject(request, getDeps(), (await params).id);
}
