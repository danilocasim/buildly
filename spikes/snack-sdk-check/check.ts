// SPIKES.md S2: for each candidate Expo SDK, resolve the foundation allowlist in a
// Snack session and report resolved versions, bundle handles, errors, and missing peers.
//
//   pnpm check [sdkVersion ...]      default: every SDK snack-sdk supports, newest first
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import {
  Snack,
  getSupportedSDKVersions,
  isModulePreloaded,
  type SDKVersion,
  type SnackState,
} from "snack-sdk";

export const ALLOWLIST = [
  "@react-navigation/native",
  "@react-navigation/native-stack",
  "@react-navigation/bottom-tabs",
  "react-native-screens",
  "react-native-safe-area-context",
  "@react-native-async-storage/async-storage",
  "expo-status-bar",
  "@expo/vector-icons",
  "expo-constants",
];

const APP = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

interface Row {
  name: string;
  requested: string;
  version: string;
  wantedVersion?: string;
  handle?: string;
  /** Shipped inside the Snack runtime (and Expo Go), so it needs no Snackager bundle. */
  preloaded: boolean;
  peerDependencies?: Record<string, string>;
  error?: string;
}

interface Report {
  sdkVersion: string;
  checkedAt: string;
  snackSdk: string;
  pass: boolean;
  rows: Row[];
  missingDependencies: SnackState["missingDependencies"];
}

// "snackager-1/@react-navigation~native@7.5.0" -> "7.5.0"
function versionFromHandle(handle: string | undefined): string | undefined {
  return handle?.slice(handle.lastIndexOf("@") + 1);
}

async function check(sdkVersion: SDKVersion): Promise<Report> {
  const snack = new Snack({
    sdkVersion,
    files: { "App.tsx": { type: "CODE", contents: APP } },
    dependencies: Object.fromEntries(ALLOWLIST.map((name) => [name, { version: "*" }])),
  });

  // Pass 1 learns the SDK-compatible versions (what `expo install` would pick); for
  // JS-only packages with no SDK pin, the exact version Snackager bundled for "*".
  const first = await snack.getStateAsync();
  const wanted = first.wantedDependencyVersions ?? {};
  const requested = Object.fromEntries(
    ALLOWLIST.map((name) => [
      name,
      wanted[name] ?? versionFromHandle(first.dependencies[name]?.handle) ?? "*",
    ]),
  );

  // Pass 2 pins those versions, as foundation.json will, and resolves them again.
  snack.updateDependencies(
    Object.fromEntries(Object.entries(requested).map(([name, version]) => [name, { version }])),
  );
  const state = await snack.getStateAsync();

  const rows: Row[] = ALLOWLIST.map((name) => {
    const dep = state.dependencies[name];
    return {
      name,
      requested: requested[name]!,
      version: dep?.version ?? "(absent)",
      wantedVersion: dep?.wantedVersion ?? wanted[name],
      handle: dep?.handle,
      preloaded: isModulePreloaded(name, sdkVersion),
      peerDependencies: dep?.peerDependencies,
      error: dep?.error?.message,
    };
  });
  const pass =
    rows.every((row) => (row.handle || row.preloaded) && !row.error) &&
    Object.keys(state.missingDependencies).length === 0;
  return {
    sdkVersion,
    checkedAt: new Date().toISOString(),
    snackSdk: (JSON.parse(readFileSync(new URL("./node_modules/snack-sdk/package.json", import.meta.url), "utf8")) as { version: string }).version,
    pass,
    rows,
    missingDependencies: state.missingDependencies,
  };
}

const sdks = (process.argv.slice(2).length ? process.argv.slice(2) : [...getSupportedSDKVersions()].reverse()) as SDKVersion[];
mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
console.log(`snack-sdk supports: ${getSupportedSDKVersions().join(", ")}`);
for (const sdk of sdks) {
  const report = await check(sdk);
  writeFileSync(new URL(`./results/sdk-${sdk}.json`, import.meta.url), JSON.stringify(report, null, 2) + "\n");
  console.log(`\nSDK ${sdk}: ${report.pass ? "PASS" : "FAIL"}`);
  for (const r of report.rows) {
    console.log(
      `  ${r.name.padEnd(44)} ${r.version.padEnd(10)} wanted=${(r.wantedVersion ?? "-").padEnd(10)} ${r.handle ? "bundled" : r.preloaded ? "preloaded" : "NOT RESOLVED"}${r.error ? `  error: ${r.error}` : ""}`,
    );
  }
  for (const [name, m] of Object.entries(report.missingDependencies)) {
    console.log(`  missing peer ${name}@${m.wantedVersion ?? "*"} (needed by ${m.dependents.join(", ")})`);
  }
}
process.exit(0);
