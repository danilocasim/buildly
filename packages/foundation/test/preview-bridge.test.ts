import { isResetDemoDataMessage, RESET_DEMO_DATA_MESSAGE } from "../src/components/PreviewBridge";

describe("preview bridge", () => {
  it("recognizes only the workspace's reset message", () => {
    expect(isResetDemoDataMessage({ type: RESET_DEMO_DATA_MESSAGE })).toBe(true);
    expect(isResetDemoDataMessage({ type: "buildly:other" })).toBe(false);
    expect(isResetDemoDataMessage("buildly:reset-demo-data")).toBe(false);
    expect(isResetDemoDataMessage(null)).toBe(false);
    expect(isResetDemoDataMessage(undefined)).toBe(false);
  });
});
