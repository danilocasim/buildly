"use client";

import { BatteryFull, Signal, Wifi } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { bezelFor, fitScale, frameSize, type Device } from "./devices";

/**
 * A phone-shaped frame around the preview (ARCHITECTURE.md §6). The screen is drawn at the
 * device's size in points with its status bar and home indicator, so the player gets the
 * same safe area an app gets on that phone; the whole frame is then scaled to fit the space
 * it has, rather than squeezed, so the app's layout never changes with the window size.
 */
export function PhoneFrame({ device, children }: { device: Device; children: React.ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailable({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const frame = frameSize(device);
  const bezel = bezelFor(device);
  const scale = available ? fitScale(frame, available) : 1;
  const outerRadius = device.screenRadius ? device.screenRadius + bezel.side : 56;

  return (
    <div ref={boxRef} className="flex h-full min-h-0 w-full min-w-0 overflow-auto px-6 pt-1 pb-10">
      {/* Holds the scaled size in layout; m-auto centers it without clipping on overflow. */}
      <div
        className="relative m-auto shrink-0"
        style={{
          width: frame.width * scale,
          height: frame.height * scale,
          visibility: available ? "visible" : "hidden",
        }}
      >
        <div
          data-testid="phone-frame"
          data-device={device.key}
          className="absolute top-0 left-0 bg-ink shadow-[0_16px_40px_rgb(23_23_23/0.24)]"
          style={{
            width: frame.width,
            height: frame.height,
            borderRadius: outerRadius,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <div
            data-testid="phone-screen"
            className="absolute flex flex-col overflow-hidden bg-white"
            style={{
              left: bezel.side,
              top: bezel.top,
              width: device.width,
              height: device.height,
              borderRadius: device.screenRadius,
            }}
          >
            <StatusBar device={device} />
            <div className="relative min-h-0 flex-1">{children}</div>
            {device.safeBottom > 0 && (
              <div
                aria-hidden="true"
                className="relative shrink-0"
                style={{ height: device.safeBottom }}
              >
                <span className="absolute bottom-2 left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-ink" />
              </div>
            )}
          </div>
          {device.cutout === "none" && (
            <>
              <span
                aria-hidden="true"
                className="absolute left-1/2 h-[6px] w-[60px] -translate-x-1/2 rounded-full bg-white/15"
                style={{ top: bezel.top / 2 - 3 }}
              />
              <span
                aria-hidden="true"
                className="absolute left-1/2 h-[52px] w-[52px] -translate-x-1/2 rounded-full border-2 border-white/15"
                style={{ bottom: bezel.bottom / 2 - 26 }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const CUTOUT = {
  island: { top: 11, width: 126, height: 37, className: "rounded-full" },
  notch: { top: 0, width: 162, height: 32, className: "rounded-b-[20px]" },
} as const;

/** The iOS status bar: the time in the left ear, signal, Wi-Fi, and battery in the right. */
function StatusBar({ device }: { device: Device }) {
  const icons = (
    <span className="flex items-center gap-[5px]">
      <Signal size={15} strokeWidth={2.75} />
      <Wifi size={15} strokeWidth={2.75} />
      <BatteryFull size={22} strokeWidth={2} />
    </span>
  );
  if (device.cutout === "none") {
    return (
      <div
        aria-hidden="true"
        className="flex shrink-0 items-center justify-between px-[6px] text-[12px] font-semibold text-ink"
        style={{ height: device.safeTop }}
      >
        <Signal size={12} strokeWidth={2.75} />
        <span>9:41</span>
        <BatteryFull size={18} strokeWidth={2} />
      </div>
    );
  }
  const cutout = CUTOUT[device.cutout];
  return (
    <div
      aria-hidden="true"
      className="relative shrink-0 text-[16px] font-semibold text-ink"
      style={{ height: device.safeTop }}
    >
      <span
        className={`absolute left-1/2 -translate-x-1/2 bg-ink ${cutout.className}`}
        style={{ top: cutout.top, width: cutout.width, height: cutout.height }}
      />
      <div
        className="absolute inset-x-0 flex items-center"
        style={{
          top: device.cutout === "island" ? cutout.top : 4,
          height: cutout.height,
        }}
      >
        <span className="flex flex-1 justify-center pl-2">9:41</span>
        <span style={{ width: cutout.width }} />
        <span className="flex flex-1 justify-center pr-2">{icons}</span>
      </div>
    </div>
  );
}
