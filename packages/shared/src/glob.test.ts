import { describe, expect, it } from "vitest";
import { globToRegExp, matchesAnyGlob } from "./glob";

describe("glob", () => {
  it.each([
    ["src/screens/**/*.tsx", "src/screens/Home.tsx", true],
    ["src/screens/**/*.tsx", "src/screens/entries/Detail.tsx", true],
    ["src/screens/**/*.tsx", "src/screens/Home.ts", false],
    ["src/screens/**/*.tsx", "src/screensX/Home.tsx", false],
    ["src/theme/**", "src/theme/index.tsx", true],
    ["src/theme/**", "src/theme/a/b.ts", true],
    ["src/theme/**", "src/themes/index.tsx", false],
    ["App.tsx", "App.tsx", true],
    ["App.tsx", "AppXtsx", false],
    ["src/*.ts", "src/a/b.ts", false],
  ])("%s vs %s → %s", (glob, path, expected) => {
    expect(globToRegExp(glob).test(path)).toBe(expected);
  });

  it("matchesAnyGlob", () => {
    expect(matchesAnyGlob("src/data/seed.ts", ["src/navigation.tsx", "src/data/seed.ts"])).toBe(
      true,
    );
    expect(matchesAnyGlob("../secrets", ["src/**"])).toBe(false);
  });
});
