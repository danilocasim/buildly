import type { NextConfig } from "next";

// The spike lives inside the repo's pnpm workspace; pin the root so Next does not pick
// up the repo lockfile.
const config: NextConfig = {
  turbopack: { root: __dirname },
  // 127.0.0.1 is the "other origin" of the 4b.0.1 negative check (packages/web-player/scripts/verify.ts).
  allowedDevOrigins: ["127.0.0.1"],
};
export default config;
