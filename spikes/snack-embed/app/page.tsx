import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SnackSpike } from "./snack-spike";

// The S2 app: imports every allowlisted dependency and counts opens in AsyncStorage.
export default function Page() {
  const app = readFileSync(join(process.cwd(), "snack-app.tsx"), "utf8");
  const foundation = JSON.parse(
    readFileSync(join(process.cwd(), "../../packages/foundation/foundation.json"), "utf8"),
  ) as { sdkVersion: string; dependencies: Record<string, string> };
  return <SnackSpike app={app} sdkVersion={foundation.sdkVersion} dependencies={foundation.dependencies} />;
}
