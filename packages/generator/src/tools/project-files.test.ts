import { describe, expect, it } from "vitest";
import { ProjectFiles } from "./project-files";

describe("ProjectFiles", () => {
  it("reads back what was written", () => {
    const files = new ProjectFiles();
    files.write("src/screens/Home.tsx", "export const a = 1;\n");
    expect(files.read("src/screens/Home.tsx")).toBe("export const a = 1;\n");
    expect(files.read("missing.ts")).toBeUndefined();
  });

  it("lists sorted paths and drops deleted ones", () => {
    const files = new ProjectFiles({ "src/b.ts": "b", "src/a.ts": "a" });
    expect(files.list()).toEqual(["src/a.ts", "src/b.ts"]);
    expect(files.delete("src/a.ts")).toBe(true);
    expect(files.list()).toEqual(["src/b.ts"]);
    expect(files.delete("src/a.ts")).toBe(false);
  });

  it("records every mutation, in order, and nothing for a no-op delete", () => {
    const files = new ProjectFiles({ "src/navigation.tsx": "old" });
    files.write("src/navigation.tsx", "new");
    files.write("src/screens/New.tsx", "x");
    files.delete("src/navigation.tsx");
    files.delete("does/not/exist.ts");
    expect(files.changes).toEqual([
      { seq: 1, op: "write", path: "src/navigation.tsx", created: false, bytes: 3 },
      { seq: 2, op: "write", path: "src/screens/New.tsx", created: true, bytes: 1 },
      { seq: 3, op: "delete", path: "src/navigation.tsx" },
    ]);
    expect(files.changedPaths()).toEqual(["src/navigation.tsx", "src/screens/New.tsx"]);
    expect(files.toFileSet()).toEqual({ "src/screens/New.tsx": "x" });
  });
});
