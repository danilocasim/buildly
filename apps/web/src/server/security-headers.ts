// Response headers for every route (TODO 7.2.2, ARCHITECTURE.md §8). The CSP pins framing:
// the workspace may frame only Buildly's web player, and no site may frame Buildly.
// Script, style, and connect sources are left to the browser defaults in the MVP: Next's
// inline bootstrap scripts and the in-browser Snack session would need nonces and an origin
// list that has not been audited yet.

/** The web player's origin from SNACK_WEB_PLAYER_URL, or null when unset or invalid. */
export function playerOriginFrom(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.replace("%%SDK_VERSION%%", "0")).origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(playerOrigin: string | null): string {
  return [
    `frame-src ${playerOrigin ?? "'none'"}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function securityHeaders(playerOrigin: string | null): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(playerOrigin) },
    // Two years, every subdomain. Browsers ignore it over plain http (local development).
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
}
