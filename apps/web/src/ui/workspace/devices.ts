// iPhone models for the web preview (brief §5, D24). Sizes are logical points, which is
// what a React Native layout sees on the device, so the app in the preview lays out at the
// same width and height as on that phone. `safeTop` and `safeBottom` are the device's
// safe-area insets: the frame draws the status bar and home indicator there, and the
// player gets only the area between them, as an app inside SafeArea would on the phone.

export type Cutout = "island" | "notch" | "none";

export interface Device {
  key: string;
  label: string;
  /** Other models with the same screen, shown in the picker's tooltip. */
  sameAs?: string;
  width: number;
  height: number;
  safeTop: number;
  safeBottom: number;
  cutout: Cutout;
  /** Screen corner radius in points (0 for a home-button phone). */
  screenRadius: number;
}

export const DEVICES: readonly Device[] = [
  {
    key: "iphone-se",
    label: "iPhone SE",
    sameAs: "iPhone 8, SE (2nd and 3rd gen)",
    width: 375,
    height: 667,
    safeTop: 20,
    safeBottom: 0,
    cutout: "none",
    screenRadius: 0,
  },
  {
    key: "iphone-13-mini",
    label: "iPhone 13 mini",
    sameAs: "iPhone 12 mini",
    width: 375,
    height: 812,
    safeTop: 50,
    safeBottom: 34,
    cutout: "notch",
    screenRadius: 44,
  },
  {
    key: "iphone-16",
    label: "iPhone 16",
    sameAs: "iPhone 15, 15 Pro",
    width: 393,
    height: 852,
    safeTop: 59,
    safeBottom: 34,
    cutout: "island",
    screenRadius: 55,
  },
  {
    key: "iphone-16-plus",
    label: "iPhone 16 Plus",
    sameAs: "iPhone 15 Plus, 15 Pro Max",
    width: 430,
    height: 932,
    safeTop: 59,
    safeBottom: 34,
    cutout: "island",
    screenRadius: 55,
  },
  {
    key: "iphone-17-pro",
    label: "iPhone 17 Pro",
    sameAs: "iPhone 16 Pro, 17",
    width: 402,
    height: 874,
    safeTop: 62,
    safeBottom: 34,
    cutout: "island",
    screenRadius: 62,
  },
  {
    key: "iphone-17-pro-max",
    label: "iPhone 17 Pro Max",
    sameAs: "iPhone 16 Pro Max",
    width: 440,
    height: 956,
    safeTop: 62,
    safeBottom: 34,
    cutout: "island",
    screenRadius: 62,
  },
];

export const DEFAULT_DEVICE = "iphone-16";

export function deviceFor(key: string | null | undefined): Device {
  const found = DEVICES.find((d) => d.key === key) ?? DEVICES.find((d) => d.key === DEFAULT_DEVICE);
  return found!;
}

/** Bezel around the screen in points; a home-button phone has a forehead and a chin. */
export function bezelFor(device: Device): { side: number; top: number; bottom: number } {
  return device.cutout === "none"
    ? { side: 14, top: 72, bottom: 72 }
    : { side: 12, top: 12, bottom: 12 };
}

/** The frame's outer size in points. */
export function frameSize(device: Device): { width: number; height: number } {
  const bezel = bezelFor(device);
  return {
    width: device.width + bezel.side * 2,
    height: device.height + bezel.top + bezel.bottom,
  };
}

/** The smallest scale the frame is drawn at; below it the preview area scrolls. */
export const MIN_SCALE = 0.4;

/**
 * The scale that fits a frame into the space available: never above 1, so the preview is
 * not drawn larger than the phone, and never below MIN_SCALE. An unmeasured box gives 1.
 */
export function fitScale(
  frame: { width: number; height: number },
  available: { width: number; height: number },
): number {
  if (available.width <= 0 || available.height <= 0) return 1;
  const scale = Math.min(1, available.width / frame.width, available.height / frame.height);
  return Math.max(MIN_SCALE, scale);
}
