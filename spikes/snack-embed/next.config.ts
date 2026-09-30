import type { NextConfig } from "next";

// The spike lives inside the repo's pnpm workspace; pin the root so Next does not pick
// up the repo lockfile.
const config: NextConfig = { turbopack: { root: __dirname } };
export default config;
