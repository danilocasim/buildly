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
