import { getDeps } from "@/src/server/deps";
import { consumeMagicLink } from "@/src/server/handlers/auth";

export const GET = (request: Request) => consumeMagicLink(request, getDeps());
