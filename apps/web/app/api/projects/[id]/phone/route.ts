import foundation from "@buildly/foundation/dist/foundation-files.json";
import { getDeps } from "@/src/server/deps";
import { openOnPhone } from "@/src/server/handlers/phone";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return openOnPhone(request, getDeps(), (await params).id, foundation.manifest.sdkVersion);
}
