// Builds the export ZIP (TODO 6.3.1): the foundation files, the project files, a
// package.json with the pinned allowlist, app.json with the project's name, the README from
// the foundation's template (attribution for Free, none for Pro), an Expo entry point, and
// a .gitignore. Every export passes the secret guard before it is zipped (6.3.3). Buildly
// assembles the ZIP itself; Snack is not involved (ARCHITECTURE.md §8).
import { scanFiles, type Finding } from "@buildly/scripts/check-no-secrets";
import type { FoundationManifest } from "@buildly/shared";
import { strToU8, unzipSync, zipSync } from "fflate";

export type FileSet = Record<string, string>;

export interface ExportInput {
  appName: string;
  plan: "free" | "pro";
  /** The snapshot's project files. */
  projectFiles: FileSet;
  /** `layout.foundationFiles` of the foundation (App.tsx, app.json, tsconfig.json, src/…). */
  foundationFiles: FileSet;
  manifest: FoundationManifest;
  /** packages/foundation/export/README.md. */
  readmeTemplate: string;
}

/** Dev dependencies the exported project needs for `npx tsc --noEmit`; a test pins them to the foundation's catalog. */
export const EXPORT_DEV_DEPENDENCIES: Record<string, string> = {
  "@types/react": "~19.1.10",
  typescript: "~5.9.2",
};

export const ATTRIBUTION_LINE = "Made with Buildly.";

export class ExportBlockedError extends Error {
  constructor(readonly findings: Finding[]) {
    super(
      `The export was blocked: ${findings.length} possible secret(s) in ${[...new Set(findings.map((f) => f.file))].join(", ")}.`,
    );
    this.name = "ExportBlockedError";
  }
}

/** "My Journal!" → "my-journal"; never empty. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return slug || "my-app";
}

/** The ZIP's entries (path → contents), after the secret guard. */
export function buildExportEntries(input: ExportInput): FileSet {
  const slug = slugify(input.appName);
  const sdkMajor = input.manifest.sdkVersion.split(".")[0]!;
  const foundationAppJson = JSON.parse(input.foundationFiles["app.json"] ?? '{"expo":{}}') as {
    expo: Record<string, unknown>;
  };
  const appJson = {
    expo: {
      ...foundationAppJson.expo,
      name: input.appName,
      slug,
      extra: {
        ...(foundationAppJson.expo.extra as Record<string, unknown> | undefined),
        showAttribution: input.plan === "free",
      },
    },
  };
  const packageJson = {
    name: slug,
    version: "1.0.0",
    private: true,
    main: "index.ts",
    scripts: {
      start: "expo start",
      android: "expo start --android",
      ios: "expo start --ios",
      web: "expo start --web",
      typecheck: "tsc --noEmit",
    },
    dependencies: Object.fromEntries(
      Object.entries(input.manifest.dependencies).sort(([a], [b]) => a.localeCompare(b)),
    ),
    devDependencies: EXPORT_DEV_DEPENDENCIES,
  };
  const readme = input.readmeTemplate
    .replaceAll("{{appName}}", input.appName)
    .replaceAll("{{sdkMajor}}", sdkMajor)
    .replaceAll("{{attribution}}", input.plan === "free" ? ATTRIBUTION_LINE : "")
    .replace(/\n{3,}$/, "\n");

  const entries: FileSet = {
    ...input.foundationFiles,
    ...input.projectFiles,
    "app.json": `${JSON.stringify(appJson, null, 2)}\n`,
    "package.json": `${JSON.stringify(packageJson, null, 2)}\n`,
    "index.ts":
      'import { registerRootComponent } from "expo";\nimport App from "./App";\n\nregisterRootComponent(App);\n',
    "README.md": readme,
    ".gitignore": "node_modules/\n.expo/\ndist/\n*.log\n",
  };
  const findings = scanFiles(entries);
  if (findings.length) throw new ExportBlockedError(findings);
  return entries;
}

export function buildExportZip(input: ExportInput): { entries: FileSet; zip: Uint8Array } {
  const entries = buildExportEntries(input);
  const zip = zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([path, contents]) => [path, strToU8(contents)]),
    ),
    { level: 6 },
  );
  return { entries, zip };
}

/** The entries of a ZIP produced by buildExportZip (tests and the CI smoke). */
export function readExportZip(zip: Uint8Array): FileSet {
  const decoder = new TextDecoder();
  return Object.fromEntries(
    Object.entries(unzipSync(zip)).map(([path, bytes]) => [path, decoder.decode(bytes)]),
  );
}
