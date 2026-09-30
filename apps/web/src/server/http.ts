import type { CapDenied } from "@buildly/shared";

export const SESSION_COOKIE = "buildly_session";

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function errorJson(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  return json({ code, message, ...extra }, status);
}

export function capDenied(denied: CapDenied): Response {
  return json(
    { code: denied.code, message: denied.message, resetAt: denied.resetAt },
    denied.status,
  );
}

export function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** httpOnly, Secure (browsers accept Secure on http://localhost), SameSite=Lax. */
export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
