"use client";

import { ChevronDown, RefreshCw, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { RESET_DEMO_DATA_MESSAGE } from "@buildly/shared";
import { DEFAULT_DEVICE, DEVICES, deviceFor } from "./devices";
import { PhoneFrame } from "./PhoneFrame";
import { usePlayer, type PreviewData } from "./usePlayer";

export function PreviewPanel({
  projectId,
  snapshotId,
  building,
  phoneVerified,
}: {
  projectId: string;
  /** The project's current snapshot (from the workspace state); a change reloads the preview. */
  snapshotId: string | null;
  building: boolean;
  phoneVerified: boolean;
}) {
  const [data, setData] = useState<PreviewData>();
  const [deviceKey, setDeviceKey] = useState(DEFAULT_DEVICE);
  const device = deviceFor(deviceKey);
  const player = usePlayer(projectId, data);
  // The preview payload follows the current snapshot.
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/projects/${projectId}/preview`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<PreviewData>) : undefined))
      .then((next) => {
        if (!cancelled && next) setData(next);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, snapshotId]);

  // The chosen phone is a per-browser convenience; it is restored after mount, not during
  // render, so the server and client render the same default.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DEVICE_STORAGE_KEY);
      if (saved) setDeviceKey(deviceFor(saved).key);
    } catch {
      // Storage can be unavailable; keep the default.
    }
  }, []);
  const chooseDevice = useCallback((key: string) => {
    setDeviceKey(key);
    try {
      localStorage.setItem(DEVICE_STORAGE_KEY, key);
    } catch {
      // Not remembered this time.
    }
  }, []);

  const resetDemoData = useCallback(() => {
    player.frameRef.current?.postMessage({ type: RESET_DEMO_DATA_MESSAGE }, "*");
    void fetch(`/api/projects/${projectId}/track`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "preview.reset_demo_data" }),
    });
  }, [player.frameRef, projectId]);

  const web = building
    ? { value: "bundling…", tone: "warn" as const }
    : !snapshotId
      ? { value: "no build yet", tone: "muted" as const }
      : player.webStatus === "error"
        ? { value: "error", tone: "warn" as const }
        : { value: "bundled ✓", tone: "ok" as const };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 text-[12px]">
        <StatusChip label="Web" value={web.value} tone={web.tone} testId="status-web" />
        <StatusChip
          label="Phone"
          value={phoneVerified ? "QR opened" : "not verified"}
          tone={phoneVerified ? "ok" : "muted"}
          testId="status-phone"
        />
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={player.refresh}
            disabled={!player.webPreviewURL}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-muted hover:bg-line/50 hover:text-ink disabled:opacity-50"
          >
            <RefreshCw size={13} aria-hidden="true" /> Refresh
          </button>
          <button
            type="button"
            onClick={resetDemoData}
            disabled={!player.webPreviewURL}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-muted hover:bg-line/50 hover:text-ink disabled:opacity-50"
          >
            <RotateCcw size={13} aria-hidden="true" /> Reset demo data
          </button>
          <label className="relative flex items-center">
            <select
              aria-label="Device"
              data-testid="device-picker"
              value={device.key}
              title={device.sameAs ? `Same screen as ${device.sameAs}` : undefined}
              onChange={(event) => chooseDevice(event.target.value)}
              className="appearance-none rounded-lg border border-line bg-surface py-1.5 pr-7 pl-2.5 text-[13px] text-ink hover:bg-bg"
            >
              {DEVICES.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label} · {d.width}×{d.height}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              aria-hidden="true"
              className="pointer-events-none absolute right-2 text-muted"
            />
          </label>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-h-0 flex-1 flex-col items-center pt-4 pb-3">
          <span className="mb-3 shrink-0 rounded-full bg-line/70 px-2.5 py-1 text-[11px] font-medium text-muted">
            Web preview
          </span>
          <div className="min-h-0 w-full flex-1">
            <PhoneFrame device={device}>
              {player.webPreviewURL ? (
                <iframe
                  key={player.epoch}
                  title="Web preview"
                  data-testid="web-preview"
                  ref={(element) => {
                    player.frameRef.current = element?.contentWindow ?? null;
                  }}
                  src={player.webPreviewURL}
                  allow="geolocation; camera; microphone"
                  className="h-full w-full border-0"
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-muted">
                  {snapshotId ? "Loading the preview…" : "Your first build will appear here."}
                </div>
              )}
            </PhoneFrame>
          </div>
          <p
            data-testid="preview-snapshot"
            data-snapshot-id={snapshotId ?? ""}
            data-web-status={player.webStatus}
            className="mt-3 shrink-0 font-mono text-[11px] text-muted"
          >
            {snapshotId ? `Snapshot ${snapshotId.slice(0, 8)}` : "No preview yet"}
          </p>
          {player.webError && (
            <p className="mt-1 max-w-sm text-center text-[12px] text-danger">{player.webError}</p>
          )}
          {building && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg/60 backdrop-blur-[1px]">
              <span className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-medium shadow-card">
                Showing the last working version while the build runs
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const DEVICE_STORAGE_KEY = "buildly.previewDevice";

function StatusChip({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "muted";
  testId: string;
}) {
  const cls = {
    ok: "bg-success-subtle text-success",
    warn: "bg-warn-subtle text-warn",
    muted: "bg-line/60 text-muted",
  }[tone];
  return (
    <span
      data-testid={testId}
      data-value={value}
      className={`rounded-full px-2.5 py-1 font-medium ${cls}`}
    >
      {label}: {value}
    </span>
  );
}
