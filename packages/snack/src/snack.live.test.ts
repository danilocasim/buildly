// Live Snack integration (TODO 4.5.2): real snack-sdk against Expo's servers. Skipped
// unless SNACK_LIVE=1, so CI never depends on Expo; run it with `pnpm test:snack`.
import { describe, expect, it } from "vitest";
import { loadFoundationFiles, readManifest } from "@buildly/foundation";
import { loadStarterFiles } from "@buildly/starters";
import { createSnackManager } from "./index";

const live = process.env.SNACK_LIVE === "1";

describe.skipIf(!live)("@snack live session", () => {
  it("creates a session with the journal starter and bundles it without errors", async () => {
    const manager = createSnackManager({
      manifest: readManifest(),
      foundationFiles: loadFoundationFiles(),
    });
    const project = { id: "live-test-journal", name: "Journal (live test)" };
    const session = manager.ensureSession(project);
    try {
      manager.pushFiles(session, project, loadStarterFiles("journal"));
      const result = await manager.awaitBundle(session, 60_000);
      expect(result).toEqual({ ok: true, diagnostics: [] });
      const urls = manager.getUrls(session);
      expect(urls.expoGoUrl).toMatch(/^exp:\/\//);
      expect(urls.expoGoUrl).toContain(session.channel);

      expect(await manager.checkBundle(project, loadStarterFiles("habit-tracker"), 60_000)).toEqual(
        { ok: true, diagnostics: [] },
      );
    } finally {
      manager.close(project.id);
    }
  }, 120_000);
});
