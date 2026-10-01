// The starter thumbnails served from public/ are copies of packages/starters/thumbnails.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import starters from "@buildly/starters/dist/starters-files.json";

describe("starter thumbnails", () => {
  it.each(starters.starters.map((s) => [s.slug, s.thumbnail] as const))(
    "public/starters/%s.png equals the package's file",
    (slug, thumbnail) => {
      const served = readFileSync(new URL(`../../../public/starters/${slug}.png`, import.meta.url));
      const source = readFileSync(
        new URL(`../../../../../packages/starters/${thumbnail}`, import.meta.url),
      );
      expect(served.equals(source)).toBe(true);
    },
  );
});
