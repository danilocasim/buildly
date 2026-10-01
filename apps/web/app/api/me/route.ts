import { getDeps } from "@/src/server/deps";
import { getMe, patchMe } from "@/src/server/handlers/me";

export const GET = (request: Request) => getMe(request, getDeps());
export const PATCH = (request: Request) => patchMe(request, getDeps());
