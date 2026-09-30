import { getDeps } from "@/src/server/deps";
import { cancelGeneration } from "@/src/server/handlers/generations";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return cancelGeneration(request, getDeps(), (await params).id);
}
