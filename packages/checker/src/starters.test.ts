import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadFoundationFiles } from "@buildly/foundation";
import { loadStarterFiles, readStarters } from "@buildly/starters";
import { assembleProject, runTypecheck } from "./index";

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("starters assembled on the foundation", () => {
  it.each(readStarters().map((s) => s.slug))("%s passes tsc --noEmit", async (slug) => {
    const dir = mkdtempSync(join(tmpdir(), `checker-${slug}-`));
    dirs.push(dir);
    const result = await runTypecheck(
      assembleProject(loadFoundationFiles(), loadStarterFiles(slug), dir),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
