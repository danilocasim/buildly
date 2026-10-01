import { getDeps } from "@/src/server/deps";
import { streamProject } from "@/src/server/handlers/stream";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return streamProject(request, getDeps(), (await params).id);
}
