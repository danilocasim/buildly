import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadFoundationFiles, loadTemplateFiles } from "@buildly/foundation";
import { assembleProject, runTypecheck } from "./index";

const dirs: string[] = [];
function tmp() {
  const dir = mkdtempSync(join(tmpdir(), "checker-test-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const foundation = loadFoundationFiles();

describe("checker", () => {
  it("passes the bare foundation template", async () => {
    const result = await runTypecheck(assembleProject(foundation, loadTemplateFiles(), tmp()));
    expect(result).toMatchObject({ ok: true, diagnostics: [] });
  });

  it("reports an injected type error with the right file and line", async () => {
    const project = loadTemplateFiles();
    project["src/screens/HomeScreen.tsx"] += '\nconst x: number = "a";\n';
    const lines = project["src/screens/HomeScreen.tsx"]!.split("\n");
    const expectedLine = lines.findIndex((l) => l.includes('const x: number = "a"')) + 1;

    const result = await runTypecheck(assembleProject(foundation, project, tmp()));
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ errorCode: "typecheck" });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      source: "typecheck",
      file: "src/screens/HomeScreen.tsx",
      line: expectedLine,
      code: "TS2322",
    });
  });

  it("returns errorCode timeout when tsc exceeds the limit", async () => {
    const result = await runTypecheck(assembleProject(foundation, loadTemplateFiles(), tmp()), {
      timeoutMs: 1,
    });
    expect(result).toMatchObject({ ok: false, errorCode: "timeout", diagnostics: [] });
  });

  it("refuses project files that escape the project or replace foundation files", () => {
    expect(() => assembleProject(foundation, { "../evil.ts": "" }, tmp())).toThrow(
      "Unsafe project path",
    );
    expect(() => assembleProject(foundation, { "src/data/store.ts": "" }, tmp())).toThrow(
      "overrides a foundation file",
    );
  });

  it("fails clearly without a pre-baked TypeScript", () => {
    expect(() => assembleProject(foundation, {}, tmp(), { nodeModules: tmp() })).toThrow(
      "No TypeScript",
    );
  });
});
