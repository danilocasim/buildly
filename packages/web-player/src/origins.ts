// The origin check Buildly's build of the Snack web player uses (patches/allowed-origins.patch
// puts the same functions into runtime/src/transports/RuntimeTransportImplWebPlayer.ts). A
// test keeps the two copies equal.

/** Exact origin, or `https://*.example.com` for any subdomain of it (never the apex). */
export function matchesOrigin(origin: string, pattern: string): boolean {
  if (!pattern.includes("*")) return origin === pattern;
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[a-z0-9-]+(?:\\.[a-z0-9-]+)*");
  return new RegExp(`^${escaped}$`, "i").test(origin);
}

export function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
  return (
    allowedOrigins.some((pattern) => matchesOrigin(origin, pattern)) ||
    origin.startsWith("http://localhost:")
  );
}

/** EXPO_PUBLIC_SNACK_ALLOWED_ORIGINS as the player parses it. */
export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
