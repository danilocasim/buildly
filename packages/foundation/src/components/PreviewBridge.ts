// Messages the Buildly workspace posts into the web preview (read-only foundation code).
// The player iframe is cross-origin, so the workspace uses window.postMessage; only the
// message type is checked, since the one action (reseeding demo data) is harmless.
import { useEffect } from "react";
import { Platform } from "react-native";

/** Must match RESET_DEMO_DATA_MESSAGE in packages/shared/src/preview.ts. */
export const RESET_DEMO_DATA_MESSAGE = "buildly:reset-demo-data";

export function isResetDemoDataMessage(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === RESET_DEMO_DATA_MESSAGE
  );
}

/** On web, runs `onReset` when the workspace asks for the demo data to be reseeded. */
export function usePreviewBridge(onReset: () => void): void {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const listener = (event: { data?: unknown }) => {
      if (isResetDemoDataMessage(event.data)) onReset();
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [onReset]);
}
