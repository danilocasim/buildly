"use client";

// The browser-side Snack session behind the web preview (ARCHITECTURE.md §6): snack-sdk
// instance fed with the current snapshot's assembled files, driving the self-hosted player
// iframe through the SDK's web preview reference. Offline: Expo Go is served by the
// worker's session, not this one.
import { useCallback, useEffect, useRef, useState } from "react";
import type { SDKVersion, Snack, SnackFiles, SnackState } from "snack-sdk";

export interface PreviewData {
  snapshotId: string | null;
  files: Record<string, string> | null;
  dependencies: Record<string, { version: string }>;
  sdkVersion: string;
  webPlayerURL: string | null;
  channel: string | null;
  buildStatus: string | null;
}

export type WebStatus = "idle" | "loading" | "ok" | "error";

export function usePlayer(projectId: string, data: PreviewData | undefined) {
  const frameRef = useRef<Window | null>(null);
  const snackRef = useRef<Snack | null>(null);
  const sentRef = useRef<Record<string, string>>({});
  const [webPreviewURL, setWebPreviewURL] = useState<string>();
  const [webStatus, setWebStatus] = useState<WebStatus>("idle");
  const [webError, setWebError] = useState<string>();
  const [epoch, setEpoch] = useState(0);
  const loadedForRef = useRef<string | null>(null);

  const ready = Boolean(data?.files && data.webPlayerURL);

  // One SDK instance per project (created on the client, after the module loads).
  useEffect(() => {
    if (!ready || snackRef.current) return;
    let cancelled = false;
    void import("snack-sdk").then(({ Snack }) => {
      if (cancelled || snackRef.current) return;
      const snack = new Snack({
        sdkVersion: data!.sdkVersion as SDKVersion,
        name: "Buildly preview",
        online: false,
        webPlayerURL: data!.webPlayerURL!,
        webPreviewRef: frameRef,
        dependencies: data!.dependencies,
        files: toSnackFiles(data!.files!),
        codeChangesDelay: 0,
      });
      sentRef.current = data!.files!;
      snackRef.current = snack;
      const apply = (state: SnackState) => {
        setWebPreviewURL(state.webPreviewURL);
        const web = Object.values(state.connectedClients).find((c) => c.platform === "web");
        if (!web) setWebStatus("loading");
        else if (web.status === "error") {
          setWebStatus("error");
          setWebError(web.error?.message);
        } else {
          setWebStatus("ok");
          setWebError(undefined);
        }
      };
      apply(snack.getState());
      snack.addStateListener(apply);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, data]);

  // New snapshot: replace the files (removed ones become null) and let the player reload.
  useEffect(() => {
    const snack = snackRef.current;
    if (!snack || !data?.files) return;
    const next = data.files;
    // Removed files are sent as null (what the SDK expects; its type omits the null case).
    const update: Record<string, { type: "CODE"; contents: string } | null> = {};
    for (const [path, contents] of Object.entries(next))
      if (sentRef.current[path] !== contents) update[path] = { type: "CODE", contents };
    for (const path of Object.keys(sentRef.current)) if (!(path in next)) update[path] = null;
    if (Object.keys(update).length) {
      snack.updateFiles(update);
      sentRef.current = next;
      setWebStatus("loading");
    }
  }, [data]);

  // preview.web_loaded once per snapshot, when the web client first reports ok.
  const mountedAt = useRef(Date.now());
  useEffect(() => {
    if (webStatus !== "ok" || !data?.snapshotId || loadedForRef.current === data.snapshotId) return;
    loadedForRef.current = data.snapshotId;
    void fetch(`/api/projects/${projectId}/track`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "preview.web_loaded",
        props: { load_ms: Date.now() - mountedAt.current },
      }),
    });
  }, [webStatus, data?.snapshotId, projectId]);

  useEffect(() => () => snackRef.current?.setOnline(false), []);

  /** Remounts the iframe; the SDK re-sends the code when the player reconnects. */
  const refresh = useCallback(() => {
    mountedAt.current = Date.now();
    setWebStatus("loading");
    setEpoch((n) => n + 1);
  }, []);

  return { frameRef, webPreviewURL, webStatus, webError, epoch, refresh };
}

function toSnackFiles(files: Record<string, string>): SnackFiles {
  return Object.fromEntries(
    Object.entries(files).map(([path, contents]) => [path, { type: "CODE" as const, contents }]),
  );
}
