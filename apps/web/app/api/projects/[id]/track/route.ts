import { getDeps } from "@/src/server/deps";
import { trackPreview } from "@/src/server/handlers/preview";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return trackPreview(request, getDeps(), (await params).id);
}
