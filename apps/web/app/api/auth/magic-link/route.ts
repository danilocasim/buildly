import { getDeps } from "@/src/server/deps";
import { requestMagicLink } from "@/src/server/handlers/auth";

export const POST = (request: Request) => requestMagicLink(request, getDeps());
