import { getDeps } from "@/src/server/deps";
import { getMe } from "@/src/server/handlers/me";

export const GET = (request: Request) => getMe(request, getDeps());
