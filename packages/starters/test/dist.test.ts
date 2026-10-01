// dist/starters-files.json must match the manifest and the files on disk (regenerate with
// `pnpm --filter starters dist`). Jest cannot load lib/index.ts (import.meta), so this reads
// the disk directly.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = join(__dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

describe("dist/starters-files.json", () => {
  const dist = JSON.parse(readFileSync(join(root, "dist", "starters-files.json"), "utf8")) as {
    starters: { slug: string }[];
    files: Record<string, Record<string, string>>;
  };

  it("carries the manifest", () => {
    expect(dist.starters).toEqual(JSON.parse(readFileSync(join(root, "starters.json"), "utf8")));
  });

  it("carries every starter's project files, byte for byte", () => {
    for (const { slug } of dist.starters) {
      const dir = join(root, slug);
      const onDisk = Object.fromEntries(
        walk(dir).map((abs) => [
          relative(dir, abs).split(sep).join("/"),
          readFileSync(abs, "utf8"),
        ]),
      );
      expect(dist.files[slug]).toEqual(onDisk);
    }
  });
});
