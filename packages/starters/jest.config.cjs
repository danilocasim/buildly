// One Jest project per starter. The resolver (test/resolver.cjs) overlays the starter's
// project files on the foundation, the way an assembled app sees them.
const transformed = [
  "(?:jest-)?react-native",
  "@react-native",
  "expo",
  "@expo",
  "react-navigation",
  "@react-navigation",
];
const slugs = ["journal", "habit-tracker", "inventory"];

const project = (slug) => ({
  displayName: slug,
  preset: "jest-expo",
  rootDir: `<rootDir>/${slug}`,
  roots: ["<rootDir>/../test"],
  testMatch: [`**/${slug}.test.ts?(x)`],
  resolver: "<rootDir>/../test/resolver.cjs",
  setupFilesAfterEnv: ["<rootDir>/../test/setup.ts"],
  transformIgnorePatterns: [`node_modules/(?!(?:\\.pnpm/)?(?:${transformed.join("|")}))`],
});

/** @type {import('jest').Config} */
module.exports = {
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
