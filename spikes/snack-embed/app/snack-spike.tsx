"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Snack, type SDKVersion, type SnackState } from "snack-sdk";

type Log = { at: string; type: string; message: string; platform?: string };

const BROKEN = {
  type: `\nconst typeError: number = "not a number";\n`,
  syntax: `\nconst syntaxError = ;\n`,
  runtime: `\nthrow new Error("S1 runtime throw");\n`,
};

export function SnackSpike(props: { app: string; sdkVersion: string; dependencies: Record<string, string> }) {
  const webPreviewRef = useRef<Window | null>(null);
  const snackRef = useRef<Snack | null>(null);
  const [state, setState] = useState<SnackState | null>(null);
  const [qr, setQr] = useState<string>();
  const [logs, setLogs] = useState<Log[]>([]);
  const [depTiming, setDepTiming] = useState<string>();
  const sandbox = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("sandbox");

  useEffect(() => {
    const snack = new Snack({
      sdkVersion: props.sdkVersion as SDKVersion,
      name: "Buildly S1 spike",
      files: { "App.tsx": { type: "CODE", contents: props.app } },
      dependencies: Object.fromEntries(Object.entries(props.dependencies).map(([name, version]) => [name, { version }])),
      webPreviewRef,
      online: true,
      codeChangesDelay: 300,
    });
    snackRef.current = snack;
    setState(snack.getState());
    const offState = snack.addStateListener((next) => setState(next));
    const offLog = snack.addLogListener((log) =>
      setLogs((prev) => [
        ...prev.slice(-49),
        {
          at: new Date().toISOString(),
          type: log.type,
          message: log.error ? `${log.message} [file=${log.error.fileName ?? "?"} line=${log.error.lineNumber ?? "?"}]` : log.message,
          platform: log.connectedClient?.platform,
        },
      ]),
    );
    return () => {
      offState();
      offLog();
      snack.setOnline(false);
    };
  }, [props.app, props.sdkVersion, props.dependencies]);

  useEffect(() => {
    if (state?.url) QRCode.toDataURL(state.url, { width: 220 }).then(setQr);
  }, [state?.url]);

  const clients = Object.values(state?.connectedClients ?? {}).map((c) => ({
    platform: c.platform,
    name: c.name,
    status: c.status,
    error: c.error ? { message: c.error.message, fileName: c.error.fileName, lineNumber: c.error.lineNumber } : undefined,
  }));
  const depErrors = Object.entries(state?.dependencies ?? {})
    .filter(([, d]) => d.error)
    .map(([name, d]) => `${name}: ${d.error?.message}`);

  // Read by the browser automation that fills in the S1 matrix.
  useEffect(() => {
    (window as unknown as { __s1: unknown }).__s1 = {
      origin: window.location.origin,
      sandbox,
      webPreviewURL: state?.webPreviewURL,
      url: state?.url,
      online: state?.online,
      clients,
      depErrors,
      missing: state?.missingDependencies,
      depTiming,
      logs,
    };
  });

  const inject = (kind: keyof typeof BROKEN | "reset") =>
    snackRef.current?.updateFiles({
      "App.tsx": { type: "CODE", contents: kind === "reset" ? props.app : props.app + BROKEN[kind] },
    });

  const addDependency = () => {
    const snack = snackRef.current;
    if (!snack) return;
    const started = performance.now();
    setDepTiming("resolving dayjs…");
    snack.updateDependencies({ dayjs: { version: "*" } });
    const off = snack.addStateListener((next) => {
      const dep = next.dependencies.dayjs;
      if (dep?.handle || dep?.error) {
        off();
        setDepTiming(`dayjs ${dep.handle ? `resolved (${dep.handle})` : `failed: ${dep.error?.message}`} in ${Math.round(performance.now() - started)} ms`);
      }
    });
  };

  return (
    <main style={{ display: "grid", gridTemplateColumns: "400px 1fr", gap: 24 }}>
      <section>
        <h1 style={{ fontSize: 20 }}>S1 Snack embed · SDK {props.sdkVersion}{sandbox ? " · sandboxed iframe" : ""}</h1>
        <iframe
          title="Web preview"
          ref={(c) => {
            webPreviewRef.current = c?.contentWindow ?? null;
          }}
          src={state?.webPreviewURL}
          sandbox={sandbox ? "allow-scripts allow-same-origin allow-forms allow-popups allow-modals" : undefined}
          allow="geolocation; camera; microphone"
          style={{ width: 375, height: 667, border: "1px solid #ccc", borderRadius: 24 }}
        />
      </section>
      <section>
        <h2 style={{ fontSize: 16 }}>Expo Go</h2>
        {qr ? <img src={qr} alt="Expo Go QR" width={220} height={220} /> : <p>waiting for url…</p>}
        <p style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}>{state?.url}</p>
        <p>
          <button onClick={() => inject("type")}>Inject type error</button>{" "}
          <button onClick={() => inject("syntax")}>Inject syntax error</button>{" "}
          <button onClick={() => inject("runtime")}>Inject runtime throw</button>{" "}
          <button onClick={() => inject("reset")}>Reset code</button>{" "}
          <button onClick={addDependency}>Add dependency (dayjs)</button>
        </p>
        <p>{depTiming}</p>
        <h2 style={{ fontSize: 16 }}>Connected clients</h2>
        <pre style={{ fontSize: 12 }}>{JSON.stringify(clients, null, 2)}</pre>
        <h2 style={{ fontSize: 16 }}>Dependency errors / missing</h2>
        <pre style={{ fontSize: 12 }}>{JSON.stringify({ depErrors, missing: state?.missingDependencies }, null, 2)}</pre>
        <h2 style={{ fontSize: 16 }}>Logs</h2>
        <pre style={{ fontSize: 12, maxHeight: 240, overflow: "auto" }}>
          {logs.map((l) => `${l.at.slice(11, 19)} ${l.platform ?? "-"} ${l.type}: ${l.message}`).join("\n")}
        </pre>
      </section>
    </main>
  );
}
