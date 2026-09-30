import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStorage, exportKey, snapshotKey } from "./index";
import { createTestStorage } from "./testing";

let t: Awaited<ReturnType<typeof createTestStorage>>;
beforeAll(async () => {
  t = await createTestStorage();
});
afterAll(async () => t?.cleanup());

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("storage against the local S3 server", () => {
  it("round-trips a 200-file snapshot byte for byte", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 200; i++) {
      files[`src/screens/Screen${i}.tsx`] =
        `export const s${i} = "écran ${i} — 屏幕 🚀";\n${"x".repeat(i * 7)}\n`;
    }
    files["src/data/seed.ts"] = 'const quote = "a \\"quoted\\" line";\n\ttab\r\nCRLF';
    const key = snapshotKey("p1", "s1");
    await t.storage.putSnapshot(key, files);
    const back = await t.storage.getSnapshot(key);
    expect(Object.keys(back)).toHaveLength(201);
    for (const [path, contents] of Object.entries(files)) {
      expect(Buffer.from(back[path]!, "utf8").equals(Buffer.from(contents, "utf8"))).toBe(true);
    }
  });

  it("serves an export through a signed URL that expires (200, then 403 after the ttl)", async () => {
    const key = exportKey("p1", "e1");
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    await t.storage.putExport(key, zip);
    const url = await t.storage.signedDownloadUrl(key, 2);

    const first = await fetch(url);
    expect(first.status).toBe(200);
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(zip);

    await sleep(3500);
    expect((await fetch(url)).status).toBe(403);
  });

  it("refuses unsigned reads", async () => {
    const key = snapshotKey("p2", "s2");
    await t.storage.putSnapshot(key, { "a.ts": "1" });
    const unsigned = new URL(await t.storage.signedDownloadUrl(key, 60));
    unsigned.search = "";
    expect((await fetch(unsigned)).status).toBe(403);
  });
});

describe("storage configuration", () => {
  it("targets AWS S3 in the configured region when no endpoint is set", async () => {
    const storage = createStorage({
      region: "ap-southeast-1",
      bucket: "buildly-staging",
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "example",
    });
    const url = new URL(await storage.signedDownloadUrl("snapshots/p/s.json", 60));
    expect(url.hostname).toBe("buildly-staging.s3.ap-southeast-1.amazonaws.com");
    expect(url.pathname).toBe("/snapshots/p/s.json");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
  });

  it("uses path-style URLs on a custom endpoint", async () => {
    const storage = createStorage({
      region: "us-east-1",
      bucket: "dev",
      accessKeyId: "a",
      secretAccessKey: "b",
      endpoint: "http://localhost:9000",
    });
    const url = new URL(await storage.signedDownloadUrl("k", 60));
    expect(`${url.host}${url.pathname}`).toBe("localhost:9000/dev/k");
  });
});
