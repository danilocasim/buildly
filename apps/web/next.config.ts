import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@buildly/db", "@buildly/shared", "@buildly/storage"],
  // The Postgres driver stays a Node dependency instead of being bundled.
  serverExternalPackages: ["pg"],
};

export default config;
