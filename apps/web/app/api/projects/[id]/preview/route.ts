import { getDeps } from "@/src/server/deps";
import { getPreview } from "@/src/server/handlers/preview";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return getPreview(request, getDeps(), (await params).id);
}
