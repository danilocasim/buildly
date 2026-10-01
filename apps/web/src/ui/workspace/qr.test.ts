import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { qrBitmap, qrModules, qrPath } from "./qr";

const URL =
  "exp://u.expo.dev/933fd9c0-1666-11e7-afca-d980795c5824?runtime-version=exposdk%3A54.0.0&channel-name=production&snack-channel=abcdef0123456789";

describe("QR code", () => {
  it("renders modules that decode back to the session URL", () => {
    const modules = qrModules(URL);
    expect(modules.size).toBeGreaterThan(21);
    const { data, width, height } = qrBitmap(modules);
    const decoded = jsQR(data, width, height);
    expect(decoded?.data).toBe(URL);
  });

  it("draws one square per dark module", () => {
    const modules = qrModules("hello");
    const squares = qrPath(modules).split("M").length - 1;
    expect(squares).toBe(modules.dark.filter(Boolean).length);
  });
});
