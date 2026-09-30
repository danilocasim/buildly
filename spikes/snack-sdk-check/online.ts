// Keeps an online Snack session for one starter (foundation + starter files) and writes
// its Expo Go QR code to a PNG. For on-device checks (TODO 2.2.4, 2.4.5).
//
//   pnpm exec tsx online.ts <slug> <out.png>
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import QRCode from "qrcode";
import { Snack, type SDKVersion } from "snack-sdk";

const [slug = "journal", out = "qr.png"] = process.argv.slice(2);
const repo = join(import.meta.dirname, "../..");
const foundationDir = join(repo, "packages/foundation");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.isFile() ? [join(dir, e.name)] : [],
  );
const read = (root: string, paths: string[]) =>
  Object.fromEntries(
    paths.map((abs) => [relative(root, abs).split(sep).join("/"), { type: "CODE" as const, contents: readFileSync(abs, "utf8") }]),
  );

const manifest = JSON.parse(readFileSync(join(foundationDir, "foundation.json"), "utf8")) as {
  sdkVersion: string;
  dependencies: Record<string, string>;
};
const starterDir = join(repo, "packages/starters", slug);
const files = {
  ...read(foundationDir, [
    join(foundationDir, "App.tsx"),
    join(foundationDir, "src/data/store.ts"),
    ...walk(join(foundationDir, "src/theme")),
    ...walk(join(foundationDir, "src/components")),
  ]),
  ...read(starterDir, walk(join(starterDir, "src"))),
  // A unique slug per app: the store scopes AsyncStorage by it, and Expo Go shares storage
  // between every Snack on the phone.
  "app.json": {
    type: "CODE" as const,
    contents: JSON.stringify(
      (() => {
        const app = JSON.parse(readFileSync(join(foundationDir, "app.json"), "utf8")) as { expo: Record<string, unknown> };
        return { expo: { ...app.expo, name: slug, slug: `buildly-starter-${slug}` } };
      })(),
      null,
      2,
    ),
  },
};
const dependencies = Object.fromEntries(
  Object.entries(manifest.dependencies)
    .filter(([name]) => !["react", "react-native", "expo"].includes(name))
    .map(([name, version]) => [name, { version }]),
);

const snack = new Snack({ sdkVersion: manifest.sdkVersion as SDKVersion, name: `Buildly ${slug}`, files, dependencies, online: true });
const state = await snack.getStateAsync();
await QRCode.toFile(out, state.url, { width: 600, margin: 2 });
console.log(`${slug}: online, ${Object.keys(files).length} files; QR written to ${out}`);
snack.addStateListener((next, prev) => {
  if (next.connectedClients !== prev.connectedClients) {
    for (const c of Object.values(next.connectedClients)) {
      console.log(`client ${c.platform} ${c.name}: ${c.status}${c.error ? ` error: ${c.error.message}` : ""}`);
    }
  }
});
snack.addLogListener((log) => console.log(`log ${log.connectedClient?.platform ?? "-"} ${log.type}: ${log.message.slice(0, 300)}`));
// Stay online until killed.
setInterval(() => {}, 1 << 30);
