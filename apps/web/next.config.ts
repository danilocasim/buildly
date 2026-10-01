import type { NextConfig } from "next";

// The workspace may frame only Buildly's web player (ARCHITECTURE.md §8); the full CSP is
// TODO 7.2.2. Without a configured player nothing may be framed.
const playerOrigin = (() => {
  try {
    return process.env.SNACK_WEB_PLAYER_URL
      ? new URL(process.env.SNACK_WEB_PLAYER_URL).origin
      : null;
  } catch {
    return null;
  }
})();

const config: NextConfig = {
  // The e2e server builds into .next-e2e (NEXT_DIST_DIR), so it can run beside a dev server
  // (Next allows one dev server per build directory) without touching its output.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  headers: () =>
    Promise.resolve([
      {
        source: "/app/:path*",
        headers: [
          { key: "Content-Security-Policy", value: `frame-src ${playerOrigin ?? "'none'"}` },
        ],
      },
    ]),
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@buildly/db", "@buildly/shared", "@buildly/storage"],
  // The Postgres driver stays a Node dependency instead of being bundled.
  serverExternalPackages: ["pg"],
};

export default config;
