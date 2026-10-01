import { describe, expect, it } from "vitest";
import { loadFoundationFiles, readManifest } from "@buildly/foundation";
import { loadStarterFiles } from "@buildly/starters";
import {
  RejectionBudgetExceeded,
  ToolExecutor,
  registeredRoutes,
  validateScreens,
} from "./executor";
import { ProjectFiles } from "./project-files";

const manifest = readManifest();
const foundation = loadFoundationFiles();

function journal() {
  const files = new ProjectFiles(loadStarterFiles("journal"));
  return { files, tools: new ToolExecutor(files, foundation, manifest) };
}
const call = (name: string, args: Record<string, unknown>) => ({
  name,
  arguments: JSON.stringify(args),
});

describe("tool validation (ARCHITECTURE.md §4)", () => {
  it("rejects each forbidden write with a distinct reason", () => {
    const { tools, files } = journal();
    const before = files.toFileSet();
    const outputs = [
      tools.execute(call("write_file", { path: "../secrets", contents: "x" })),
      tools.execute(call("write_file", { path: "package.json", contents: "{}" })),
      tools.execute(call("write_file", { path: "src/data/store.ts", contents: "export {};" })),
      tools.execute(
        call("write_file", {
          path: "src/screens/MapScreen.tsx",
          contents: 'import MapView from "react-native-maps";\n',
        }),
      ),
      tools.execute(
        call("write_file", { path: "src/screens/Big.tsx", contents: "x".repeat(65 * 1024) }),
      ),
    ];
    const reasons = tools.rejections.map((r) => r.reason);
    expect(reasons).toEqual([
      "path_traversal",
      "forbidden_file",
      "read_only",
      "import_not_allowed",
      "too_large",
    ]);
    expect(new Set(reasons).size).toBe(5);
    for (const output of outputs) expect(output).toMatch(/^error: [a-z_]+: /);
    expect(outputs[3]).toContain('"react-native-maps" is not available');
    expect(files.toFileSet()).toEqual(before);
    expect(files.changes).toEqual([]);
  });

  it("fails the run on the 11th rejection", () => {
    const { tools } = journal();
    for (let i = 1; i <= 10; i++) {
      expect(tools.execute(call("write_file", { path: "package.json", contents: "{}" }))).toMatch(
        /^error: forbidden_file/,
      );
    }
    expect(() =>
      tools.execute(call("write_file", { path: "package.json", contents: "{}" })),
    ).toThrow(RejectionBudgetExceeded);
    expect(tools.rejections).toHaveLength(11);
  });

  it("answers a read of a missing project file with 'not found' without spending the budget", () => {
    const { tools } = journal();
    expect(tools.execute(call("read_file", { path: "src/screens/FavoritesScreen.tsx" }))).toBe(
      "not found: src/screens/FavoritesScreen.tsx does not exist yet.",
    );
    expect(tools.execute(call("delete_file", { path: "src/screens/Nope.tsx" }))).toMatch(
      /^not found/,
    );
    expect(tools.rejections).toEqual([]);
  });

  it("reads project files and read-only foundation files, but not forbidden or outside paths", () => {
    const { tools } = journal();
    expect(tools.execute(call("read_file", { path: "src/navigation.tsx" }))).toContain(
      "EntriesScreen",
    );
    expect(tools.execute(call("read_file", { path: "src/data/store.ts" }))).toContain(
      "createRepository",
    );
    expect(tools.execute(call("read_file", { path: "app.json" }))).toContain('"slug"');
    expect(tools.execute(call("read_file", { path: "package.json" }))).toMatch(
      /^error: forbidden_file/,
    );
    expect(tools.execute(call("read_file", { path: ".env" }))).toMatch(/^error: outside_layout/);
    expect(tools.execute(call("read_file", { path: "/etc/passwd" }))).toMatch(
      /^error: path_traversal/,
    );
  });

  it("lists only the project's own files", () => {
    const { tools } = journal();
    const listed = tools.execute(call("list_files", {})).split("\n");
    expect(listed).toContain("src/navigation.tsx");
    expect(listed).not.toContain("src/data/store.ts");
    expect(listed).not.toContain("App.tsx");
  });

  it("writes an allowed file and checks relative imports stay inside the project", () => {
    const { tools, files } = journal();
    const ok = tools.execute(
      call("write_file", {
        path: "src/screens/FavoritesScreen.tsx",
        contents:
          'import { Screen } from "../components";\nimport { Text } from "react-native";\nimport { Ionicons } from "@expo/vector-icons";\n',
      }),
    );
    expect(ok).toBe("ok: wrote src/screens/FavoritesScreen.tsx");
    expect(files.changes).toHaveLength(1);
    expect(
      tools.execute(
        call("write_file", {
          path: "src/screens/X.tsx",
          contents: 'import x from "../../../etc";\n',
        }),
      ),
    ).toMatch(/^error: path_traversal/);
    expect(
      tools.execute(
        call("write_file", { path: "src/screens/Y.tsx", contents: 'const fs = require("fs");\n' }),
      ),
    ).toMatch(/^error: import_not_allowed/);
    expect(tools.execute(call("write_file", { path: "app.json", contents: "{}" }))).toMatch(
      /^error: read_only/,
    );
    expect(tools.execute(call("write_file", { path: "README.md", contents: "x" }))).toMatch(
      /^error: outside_layout/,
    );
  });

  it("rejects malformed arguments and unknown tools", () => {
    const { tools } = journal();
    expect(tools.execute({ name: "write_file", arguments: "{not json" })).toMatch(
      /^error: invalid_arguments/,
    );
    expect(tools.execute(call("run_shell", { command: "ls" }))).toMatch(
      /^error: invalid_arguments: Unknown tool/,
    );
  });
});

describe("finish", () => {
  it("keeps screens that have a route and drops one without, with a warning", () => {
    const { tools } = journal();
    expect(
      tools.execute(
        call("finish", {
          summary: "Done.",
          screens: ["Entries", "Entry detail", "New entry", "Tags", "Settings"],
        }),
      ),
    ).toBe("ok: finished");
    expect(tools.finished).toEqual({
      summary: "Done.",
      screens: ["Entries", "Entry detail", "New entry", "Tags"],
      warnings: [
        'Screen "Settings" has no route in src/navigation.tsx and was left out of the screen list.',
      ],
    });
  });

  it("reads routes from the navigation file", () => {
    const files = new ProjectFiles(loadStarterFiles("journal"));
    expect(registeredRoutes(files.read("src/navigation.tsx"))).toEqual([
      "Entries",
      "Tags",
      "About",
      "Tabs",
      "EntryDetail",
      "NewEntry",
    ]);
    expect(validateScreens(["Map"], new ProjectFiles())).toEqual({
      screens: [],
      warnings: [
        'Screen "Map" has no route in src/navigation.tsx and was left out of the screen list.',
      ],
    });
  });
});
