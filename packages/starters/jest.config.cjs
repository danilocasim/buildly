// One Jest project per starter. The resolver (test/resolver.cjs) overlays the starter's
// project files on the foundation, the way an assembled app sees them.
const { existsSync } = require("node:fs");

const transformed = [
  "(?:jest-)?react-native",
  "@react-native",
  "expo",
  "@expo",
  "react-navigation",
  "@react-navigation",
];
const slugs = ["journal", "habit-tracker", "inventory"];

// The eval harness (packages/eval) runs a starter's smoke test against generated files:
// SMOKE_ROOT is a directory under this package holding <slug>/src/… and test/<slug>.test.tsx.
// Only the starter present there is redirected; Jest validates every project's rootDir.
const smokeRoot = process.env.SMOKE_ROOT;
const smoked = (slug) => smokeRoot && existsSync(`${smokeRoot}/${slug}`);

const project = (slug) => ({
  displayName: slug,
  preset: "jest-expo",
  rootDir: smoked(slug) ? `${smokeRoot}/${slug}` : `<rootDir>/${slug}`,
  roots: [smoked(slug) ? `${smokeRoot}/test` : "<rootDir>/../test"],
  testMatch: [`**/${slug}.test.ts?(x)`],
  resolver: `${__dirname}/test/resolver.cjs`,
  setupFilesAfterEnv: [`${__dirname}/test/setup.ts`],
  transformIgnorePatterns: [`node_modules/(?!(?:\\.pnpm/)?(?:${transformed.join("|")}))`],
});

/** @type {import('jest').Config} */
module.exports = {
  testTimeout: 30_000,
  projects: [
    ...slugs.map(project),
    {
      displayName: "manifest",
      preset: "jest-expo",
      rootDir: "<rootDir>",
      roots: ["<rootDir>/test"],
      testMatch: ["**/manifest.test.ts"],
      transformIgnorePatterns: [`node_modules/(?!(?:\\.pnpm/)?(?:${transformed.join("|")}))`],
    },
  ],
};
