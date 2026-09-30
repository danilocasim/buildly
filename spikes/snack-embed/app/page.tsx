import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { SnackSpike } from "./snack-spike";

const repo = join(process.cwd(), "../..");
const foundationDir = join(repo, "packages/foundation");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.isFile() ? [join(dir, e.name)] : [],
  );
}

function read(root: string, paths: string[]): Record<string, string> {
  return Object.fromEntries(paths.map((abs) => [relative(root, abs).split(sep).join("/"), readFileSync(abs, "utf8")]));
}

// Default: the S2 allowlist app. With ?starter=<slug> (TODO 2.4.5): the foundation plus that
// starter's project files, as a Snack session will receive them.
export default async function Page({ searchParams }: { searchParams: Promise<{ starter?: string }> }) {
  const { starter } = await searchParams;
  const foundation = JSON.parse(readFileSync(join(foundationDir, "foundation.json"), "utf8")) as {
    sdkVersion: string;
    dependencies: Record<string, string>;
  };
  // react, react-native, and expo come with the Snack runtime.
  const dependencies = Object.fromEntries(
    Object.entries(foundation.dependencies).filter(([name]) => !["react", "react-native", "expo"].includes(name)),
  );

  let files: Record<string, string>;
  if (starter && /^[a-z-]+$/.test(starter)) {
    const foundationFiles = read(foundationDir, [
      join(foundationDir, "App.tsx"),
      join(foundationDir, "src/data/store.ts"),
      ...walk(join(foundationDir, "src/theme")),
      ...walk(join(foundationDir, "src/components")),
    ]);
    const starterDir = join(repo, "packages/starters", starter);
    files = { ...foundationFiles, ...read(starterDir, walk(join(starterDir, "src"))) };
  } else {
    files = { "App.tsx": readFileSync(join(process.cwd(), "snack-app.tsx"), "utf8") };
  }
  return <SnackSpike files={files} sdkVersion={foundation.sdkVersion} dependencies={dependencies} label={starter ?? "S2 allowlist app"} />;
}
