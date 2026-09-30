import { getDeps } from "@/src/server/deps";
import { postMessage } from "@/src/server/handlers/messages";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return postMessage(request, getDeps(), (await params).id);
}
