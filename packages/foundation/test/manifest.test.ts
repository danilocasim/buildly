import { readFileSync } from "node:fs";
import { join } from "node:path";
import { foundationManifestSchema } from "@buildly/shared";

const root = join(__dirname, "..");
const manifest = foundationManifestSchema.parse(
  JSON.parse(readFileSync(join(root, "foundation.json"), "utf8")),
);
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
};

// The `foundation` catalog in pnpm-workspace.yaml, read without a YAML dependency.
function foundationCatalog(): Record<string, string> {
  const yaml = readFileSync(join(root, "../../pnpm-workspace.yaml"), "utf8");
  const block = yaml.split(/\n {2}foundation:\n/)[1]?.split(/\n\S/)[0] ?? "";
  return Object.fromEntries(
    [...block.matchAll(/^ {4}"?([^":#\s][^":]*?)"?: (\S+)$/gm)].map((m) => [m[1], m[2]]),
  );
}

describe("foundation.json", () => {
  it("validates against the shared zod schema", () => {
    expect(manifest.sdkVersion).toBe("54.0.0");
  });

  it("allowlists exactly the package.json dependencies", () => {
    expect(Object.keys(manifest.dependencies).sort()).toEqual(
      Object.keys(packageJson.dependencies).sort(),
    );
  });

  it("pins the same versions as the pnpm foundation catalog", () => {
    const catalog = foundationCatalog();
    for (const [name, version] of Object.entries(manifest.dependencies)) {
      expect({ name, version: catalog[name] }).toEqual({ name, version });
    }
  });

  it("never makes a read-only or forbidden path writable", () => {
    const { writable, readOnly, forbidden } = manifest.layout;
    for (const path of [...readOnly.filter((p) => !p.includes("*")), ...forbidden]) {
      expect(writable).not.toContain(path);
    }
  });
});

describe("export README template", () => {
  const readme = readFileSync(join(root, manifest.layout.exportReadme), "utf8");

  it("has the placeholders the exporter fills", () => {
    for (const placeholder of ["{{appName}}", "{{sdkMajor}}", "{{attribution}}"])
      expect(readme).toContain(placeholder);
  });

  it("covers the steps TODO 6.3.4 checks: install, start, Expo Go, type check", () => {
    for (const step of ["npm install", "npx expo start", "Expo Go", "npx tsc --noEmit"])
      expect(readme).toContain(step);
  });

  it("explains demo data and schemaVersion", () => {
    expect(readme).toContain("isDemo: true");
    expect(readme).toMatch(/schemaVersion[\s\S]*reseeds the demo data/);
  });
});
