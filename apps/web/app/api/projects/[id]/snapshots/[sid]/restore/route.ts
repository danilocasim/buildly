import { getDeps } from "@/src/server/deps";
import { restoreSnapshot } from "@/src/server/handlers/snapshots";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sid: string }> },
) {
  const { id, sid } = await params;
  return restoreSnapshot(request, getDeps(), id, sid);
}
