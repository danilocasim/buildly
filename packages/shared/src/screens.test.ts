import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { humanizeScreenName, screensFromNavigation } from "./screens";

const starter = (slug: string) =>
  readFileSync(new URL(`../../starters/${slug}/src/navigation.tsx`, import.meta.url), "utf8");

describe("screensFromNavigation", () => {
  it("yields the journal starter's screens: Entries, Entry detail, New entry, Tags", () => {
    expect([...screensFromNavigation(starter("journal"))].sort()).toEqual([
      "Entries",
      "Entry detail",
      "New entry",
      "Tags",
    ]);
  });

  it("keeps registration order and skips nested navigators and foundation screens", () => {
    // Tabs (a local navigator) and About (from ./components) are not project screens.
    expect(screensFromNavigation(starter("journal"))).toEqual([
      "Entries",
      "Tags",
      "Entry detail",
      "New entry",
    ]);
    expect(screensFromNavigation(starter("habit-tracker"))).toContain("Today");
    expect(screensFromNavigation(starter("inventory"))).toContain("Adjust stock");
  });

  it("handles the bare template, a missing file, and aliased imports", () => {
    expect(
      screensFromNavigation(
        readFileSync(new URL("../../foundation/src/navigation.tsx", import.meta.url), "utf8"),
      ),
    ).toEqual(["Home"]);
    expect(screensFromNavigation(undefined)).toEqual([]);
    expect(
      screensFromNavigation(
        'import { Foo as Bar } from "./screens/Foo";\n<Stack.Screen name="FooBar" component={Bar} />',
      ),
    ).toEqual(["Foo bar"]);
  });
});

describe("humanizeScreenName", () => {
  it("splits camel case and lowercases the rest", () => {
    expect(humanizeScreenName("EntryDetail")).toBe("Entry detail");
    expect(humanizeScreenName("NewEntry")).toBe("New entry");
    expect(humanizeScreenName("Entries")).toBe("Entries");
    expect(humanizeScreenName("QRScanner")).toBe("QR scanner");
    expect(humanizeScreenName("entry_detail")).toBe("Entry detail");
  });
});
