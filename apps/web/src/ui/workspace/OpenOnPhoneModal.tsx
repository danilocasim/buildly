"use client";

import { X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { qrModules, qrPath } from "./qr";

export const EXPO_GO_IOS = "https://apps.apple.com/app/expo-go/id982107779";
export const EXPO_GO_ANDROID = "https://play.google.com/store/apps/details?id=host.exp.exponent";

export function OpenOnPhoneModal({
  url,
  hasSnapshot,
  onClose,
}: {
  /** The session's Expo Go URL, once the project has a preview session. */
  url: string | null;
  hasSnapshot: boolean;
  onClose: () => void;
}) {
  const modules = useMemo(() => (url ? qrModules(url) : null), [url]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-6">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="phone-title"
        className="relative w-[440px] max-w-full rounded-2xl border border-line bg-surface p-6 shadow-float"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="phone-title" className="text-[17px] font-semibold">
              Open on your phone
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              Scan with the Expo Go app. Your phone needs internet access.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted hover:bg-line/60"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5 flex min-h-[220px] items-center justify-center rounded-xl border border-line bg-white p-4">
          {modules ? (
            <svg
              role="img"
              aria-label="QR code for Expo Go"
              data-testid="expo-go-qr"
              width={200}
              height={200}
              viewBox={`0 0 ${modules.size} ${modules.size}`}
              shapeRendering="crispEdges"
            >
              <rect width={modules.size} height={modules.size} fill="#fff" />
              <path d={qrPath(modules)} fill="#171717" />
            </svg>
          ) : (
            <p className="text-center text-[13px] text-muted" data-testid="expo-go-pending">
              {hasSnapshot
                ? "Preparing the phone preview…"
                : "Build your app once, then scan to open it on your phone."}
            </p>
          )}
        </div>
        {url && (
          <p
            data-testid="expo-go-url"
            className="mt-3 truncate text-center font-mono text-[12px] text-muted"
          >
            {url}
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2 text-[13px]">
          <a
            href={EXPO_GO_IOS}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-line px-3 py-2 text-center font-medium hover:bg-bg"
          >
            Expo Go for iOS
          </a>
          <a
            href={EXPO_GO_ANDROID}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-line px-3 py-2 text-center font-medium hover:bg-bg"
          >
            Expo Go for Android
          </a>
        </div>
        <p className="mt-4 text-[12px] text-muted">
          Phone verification is reported separately from the web preview. Records you create on the
          phone persist across restarts.
        </p>
      </div>
    </div>
  );
}
