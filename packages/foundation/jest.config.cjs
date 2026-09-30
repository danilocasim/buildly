// jest-expo runs React Native code through Expo's Babel preset. pnpm stores packages
// as node_modules/.pnpm/<name>@<version>/node_modules/<name> (scopes as "@scope+name"),
// so the transform allowlist matches name prefixes with or without the .pnpm segment.
const transformed = [
  "(?:jest-)?react-native",
  "@react-native",
  "expo",
  "@expo",
  "react-navigation",
  "@react-navigation",
];

/** @type {import('jest').Config} */
module.exports = {
  testTimeout: 30_000,
  preset: "jest-expo",
  roots: ["<rootDir>/test"],
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  transformIgnorePatterns: [`node_modules/(?!(?:\\.pnpm/)?(?:${transformed.join("|")}))`],
};
