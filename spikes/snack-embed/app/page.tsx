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
    // Everything the foundation ships (as packages/snack sends it): App.tsx, app.json, and
    // src/ minus the project-owned template files, which the starter provides.
    const projectOwned = /^src\/(navigation\.tsx|screens\/|data\/(models|seed)\.ts)/;
    const foundationFiles = Object.fromEntries(
      Object.entries(
        read(foundationDir, [
          join(foundationDir, "App.tsx"),
          join(foundationDir, "app.json"),
          ...walk(join(foundationDir, "src")),
        ]),
      ).filter(([path]) => !projectOwned.test(path)),
    );
    const starterDir = join(repo, "packages/starters", starter);
    files = { ...foundationFiles, ...read(starterDir, walk(join(starterDir, "src"))) };
  } else {
    files = { "App.tsx": readFileSync(join(process.cwd(), "snack-app.tsx"), "utf8") };
  }
  return <SnackSpike files={files} sdkVersion={foundation.sdkVersion} dependencies={dependencies} label={starter ?? "S2 allowlist app"} />;
}
