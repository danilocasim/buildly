import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep the workspace root here so stray lockfiles elsewhere on the machine are ignored.
  outputFileTracingRoot: path.join(__dirname),
  // Lets `NEXT_DIST_DIR=.next-prod pnpm build && NEXT_DIST_DIR=.next-prod pnpm start`
  // run alongside `pnpm dev` without the two clobbering each other's output.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
