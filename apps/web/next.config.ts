import type { NextConfig } from "next";
import { playerOriginFrom, securityHeaders } from "./src/server/security-headers";

// Security headers on every route (TODO 7.2.2): the CSP's only frame-src is Buildly's web
// player (ARCHITECTURE.md §8); without a configured player nothing may be framed.
const playerOrigin = playerOriginFrom(process.env.SNACK_WEB_PLAYER_URL);

const config: NextConfig = {
  // The e2e server builds into .next-e2e (NEXT_DIST_DIR), so it can run beside a dev server
  // (Next allows one dev server per build directory) without touching its output.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  headers: () => Promise.resolve([{ source: "/:path*", headers: securityHeaders(playerOrigin) }]),
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@buildly/db", "@buildly/shared", "@buildly/storage"],
  // The Postgres driver stays a Node dependency instead of being bundled.
  serverExternalPackages: ["pg"],
};

export default config;
