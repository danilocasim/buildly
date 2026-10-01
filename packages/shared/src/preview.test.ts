import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RESET_DEMO_DATA_MESSAGE } from "./preview";

describe("preview message", () => {
  it("is the constant the foundation's PreviewBridge listens for", () => {
    const bridge = readFileSync(
      new URL("../../foundation/src/components/PreviewBridge.ts", import.meta.url),
      "utf8",
    );
    expect(bridge).toContain(`RESET_DEMO_DATA_MESSAGE = "${RESET_DEMO_DATA_MESSAGE}"`);
  });
});
