import { describe, expect, it } from "vitest";
import { DEFAULT_DEVICE, DEVICES, MIN_SCALE, deviceFor, fitScale, frameSize } from "./devices";

describe("preview devices", () => {
  it("have unique keys and include the default", () => {
    expect(new Set(DEVICES.map((d) => d.key)).size).toBe(DEVICES.length);
    expect(DEVICES.some((d) => d.key === DEFAULT_DEVICE)).toBe(true);
  });

  it("leave the app a portrait area between the safe-area insets", () => {
    for (const d of DEVICES) {
      expect(d.height - d.safeTop - d.safeBottom).toBeGreaterThan(d.width);
    }
  });

  it("reserve a home-indicator inset on every phone without a home button", () => {
    for (const d of DEVICES) expect(d.safeBottom).toBe(d.cutout === "none" ? 0 : 34);
  });

  it("fall back to the default for an unknown or missing key", () => {
    expect(deviceFor("pixel-9").key).toBe(DEFAULT_DEVICE);
    expect(deviceFor(null).key).toBe(DEFAULT_DEVICE);
    expect(deviceFor("iphone-se").key).toBe("iphone-se");
  });
});

describe("fitScale", () => {
  const frame = frameSize(deviceFor("iphone-16"));

  it("keeps a phone that fits at its real size", () => {
    expect(fitScale(frame, { width: 2000, height: 2000 })).toBe(1);
  });

  it("shrinks to the tighter of width and height", () => {
    expect(fitScale(frame, { width: 2000, height: frame.height / 2 })).toBeCloseTo(0.5);
    expect(fitScale(frame, { width: frame.width * 0.6, height: 2000 })).toBeCloseTo(0.6);
  });

  it("stops at the minimum scale and ignores an unmeasured box", () => {
    expect(fitScale(frame, { width: 10, height: 10 })).toBe(MIN_SCALE);
    expect(fitScale(frame, { width: 0, height: 0 })).toBe(1);
  });
});
