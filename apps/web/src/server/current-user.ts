// The signed-in user for server components and server actions (reads the request cookie).
import { cookies } from "next/headers";
import { auth } from "@buildly/db";
import { getDeps } from "./deps";
import { SESSION_COOKIE } from "./http";

export async function currentUser() {
  const deps = getDeps();
  return auth.getSessionUser(deps.db, (await cookies()).get(SESSION_COOKIE)?.value, deps.now());
}
