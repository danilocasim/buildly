import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { starterManifestSchema } from "@buildly/shared";

const root = join(__dirname, "..");
const starters = starterManifestSchema.parse(
  JSON.parse(readFileSync(join(root, "starters.json"), "utf8")),
);

describe("starters.json", () => {
  it("lists the three MVP starters", () => {
    expect(starters.map((s) => s.slug)).toEqual(["journal", "habit-tracker", "inventory"]);
  });

  it.each(starters.map((s) => [s.slug, s] as const))(
    "%s has a directory, a thumbnail PNG, and a smoke test",
    (slug, starter) => {
      expect(existsSync(join(root, slug, "src", "navigation.tsx"))).toBe(true);
      const png = readFileSync(join(root, starter.thumbnail));
      expect(png.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      expect(existsSync(join(root, "test", `${slug}.test.tsx`))).toBe(true);
    },
  );

  it.each(starters.map((s) => [s.slug, s] as const))(
    "%s names only screens it registers",
    (slug, starter) => {
      const navigation = readFileSync(join(root, slug, "src", "navigation.tsx"), "utf8");
      for (const screen of starter.screens) {
        const component = `${screen.replace(/\s(\w)/g, (_m, c: string) => c.toUpperCase()).replace(/^\w/, (c) => c.toUpperCase())}Screen`;
        expect(navigation).toContain(component);
      }
    },
  );
});
