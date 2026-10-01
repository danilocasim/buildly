import { getDeps } from "@/src/server/deps";
import { getFiles } from "@/src/server/handlers/files";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return getFiles(request, getDeps(), (await params).id);
}
