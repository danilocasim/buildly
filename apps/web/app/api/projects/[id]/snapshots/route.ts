import { getDeps } from "@/src/server/deps";
import { listSnapshots } from "@/src/server/handlers/projects";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return listSnapshots(request, getDeps(), (await params).id);
}
