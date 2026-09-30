"use client";

import { X } from "lucide-react";

/** Deterministic pseudo-QR so the mockup renders the same every time. */
function FakeQr({ size = 25 }: { size?: number }) {
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const cells: boolean[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inFinder = (cx: number, cy: number) => x >= cx && x < cx + 7 && y >= cy && y < cy + 7;
      const finder = inFinder(0, 0) || inFinder(size - 7, 0) || inFinder(0, size - 7);
      if (finder) {
        const [ox, oy] = x < 7 && y < 7 ? [0, 0] : x >= size - 7 && y < 7 ? [size - 7, 0] : [0, size - 7];
        const fx = x - ox;
        const fy = y - oy;
        const ring = fx === 0 || fy === 0 || fx === 6 || fy === 6;
        const core = fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4;
        cells.push(ring || core);
      } else {
        cells.push(rand() > 0.55);
      }
    }
  }
  const px = 7;
  return (
    <svg width={size * px} height={size * px} viewBox={`0 0 ${size * px} ${size * px}`} role="img" aria-label="QR code">
      <rect width="100%" height="100%" fill="#fff" />
      {cells.map((on, i) =>
        on ? <rect key={i} x={(i % size) * px} y={Math.floor(i / size) * px} width={px} height={px} fill="#171717" /> : null,
      )}
    </svg>
  );
}

export function OpenOnPhoneModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-6" onClick={onClose}>
      <div
        className="fade-up w-[440px] rounded-2xl border border-line bg-surface p-6 shadow-float"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[17px] font-semibold">Open on your phone</h2>
            <p className="mt-1 text-[13px] text-muted">Scan with the Expo Go app. Your phone needs internet access.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted hover:bg-line/60">
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 flex justify-center rounded-xl border border-line bg-white p-4">
          <FakeQr />
        </div>
        <p className="mt-3 truncate text-center font-mono text-[12px] text-muted">exp://exp.host/@buildly/reading-tracker+abc123</p>
        <div className="mt-5 grid grid-cols-2 gap-2 text-[13px]">
          <a className="rounded-lg border border-line px-3 py-2 text-center font-medium hover:bg-bg" href="#">
            Expo Go for iOS
          </a>
          <a className="rounded-lg border border-line px-3 py-2 text-center font-medium hover:bg-bg" href="#">
            Expo Go for Android
          </a>
        </div>
        <p className="mt-4 text-[12px] text-faint">
          Phone verification is reported separately from the web preview. Records you create on the phone persist across restarts.
        </p>
      </div>
    </div>
  );
}
