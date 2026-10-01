import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildApiDigest } from "../scripts/api-digest";

const root = join(__dirname, "..");
const digest = buildApiDigest(root);

describe("API digest", () => {
  it("matches the snapshot", () => {
    expect(digest).toMatchSnapshot();
  });

  it("is committed up to date (run `pnpm --filter foundation digest`)", () => {
    expect(readFileSync(join(root, "dist", "api-digest.md"), "utf8")).toBe(digest);
  });

  it("ships dist/foundation-files.json matching foundation.json and the files on disk", () => {
    // Jest cannot load lib/index.ts (import.meta), so this checks the JSON against the disk;
    // CI regenerates it with the digest and fails on a diff.
    const committed = JSON.parse(
      readFileSync(join(root, "dist", "foundation-files.json"), "utf8"),
    ) as {
      manifest: unknown;
      files: Record<string, string>;
      templateFiles: Record<string, string>;
    };
    expect(committed.manifest).toEqual(
      JSON.parse(readFileSync(join(root, "foundation.json"), "utf8")),
    );
    for (const set of [committed.files, committed.templateFiles]) {
      expect(Object.keys(set).length).toBeGreaterThan(0);
      for (const [path, contents] of Object.entries(set)) {
        expect(readFileSync(join(root, path), "utf8")).toBe(contents);
      }
    }
    expect(Object.keys(committed.files)).toEqual(
      expect.arrayContaining(["App.tsx", "app.json", "tsconfig.json", "src/data/store.ts"]),
    );
    expect(Object.keys(committed.templateFiles)).toEqual(
      expect.arrayContaining(["src/navigation.tsx", "src/data/models.ts", "src/data/seed.ts"]),
    );
  });

  it("documents every kit component and the store API", () => {
    for (const name of [
      "Screen",
      "Card",
      "ListRow",
      "Button",
      "TextField",
      "EmptyState",
      "FAB",
      "createRepository",
      "useRecords",
    ]) {
      expect(digest).toContain(`export function ${name}`);
    }
  });
});
