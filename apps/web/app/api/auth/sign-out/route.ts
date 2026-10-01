import { getDeps } from "@/src/server/deps";
import { signOut } from "@/src/server/handlers/auth";

export const POST = (request: Request) => signOut(request, getDeps());
