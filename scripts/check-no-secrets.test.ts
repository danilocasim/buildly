import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanDirectory } from "./check-no-secrets";

const dirs: string[] = [];

// Fixtures are written at test time so the repo itself never contains key-shaped text.
async function fixture(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "check-no-secrets-"));
  dirs.push(dir);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(join(dir, path, ".."), { recursive: true });
    await writeFile(join(dir, path), contents);
  }
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("scanDirectory", () => {
  it("passes a clean directory", async () => {
    const dir = await fixture({
      "App.tsx": 'export default function App() { return "task-abc disk-usage"; }\n',
      "src/screens/Home.tsx": "const url = process.env.EXPO_PUBLIC_API;\n",
    });
    expect(await scanDirectory(dir)).toEqual([]);
  });

  it("fails on an sk- key and reports file and line", async () => {
    const dir = await fixture({ "src/data/seed.ts": "const a = 1;\nconst key = 'sk-abc';\n" });
    expect(await scanDirectory(dir)).toEqual([
      { file: join("src", "data", "seed.ts"), line: 2, rule: "openai-key-prefix" },
    ]);
  });

  it("fails on a project key", async () => {
    const dir = await fixture({ "bundle.js": 'var k="sk-proj-AbC123_def";' });
    expect(await scanDirectory(dir)).toMatchObject([{ rule: "openai-key-prefix" }]);
  });

  it("fails on any server env name", async () => {
    const dir = await fixture({
      "a.js": "process.env.OPENAI_API_KEY",
      "nested/b.js": "const u = process.env.DATABASE_URL;",
      "c.md": "Set SESSION_SECRET first",
    });
    expect((await scanDirectory(dir)).map((f) => f.rule)).toEqual([
      "env-name:OPENAI_API_KEY",
      "env-name:SESSION_SECRET",
      "env-name:DATABASE_URL",
    ]);
  });

  it("skips node_modules", async () => {
    const dir = await fixture({ "node_modules/pkg/index.js": "OPENAI_API_KEY" });
    expect(await scanDirectory(dir)).toEqual([]);
  });
});
