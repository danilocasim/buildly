// Analytics event names. The catalog, emitters, and props are defined in
// .plan/mvp/METRICS.md; names are stable because stored rows reference them.
export const EVENTS = {
  userSignedIn: "user.signed_in",
  projectCreated: "project.created",
  projectOpened: "project.opened",
  buildStarted: "build.started",
  buildStep: "build.step",
  buildRepair: "build.repair",
  buildFinished: "build.finished",
  buildCancelled: "build.cancelled",
  previewWebLoaded: "preview.web_loaded",
  previewPhoneOpened: "preview.phone_opened",
  previewResetDemoData: "preview.reset_demo_data",
  snapshotRestored: "snapshot.restored",
  exportCreated: "export.created",
  capHit: "cap.hit",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export const EVENT_NAMES: readonly EventName[] = Object.values(EVENTS);

export type CapName = "monthly_builds" | "hourly_builds" | "concurrent_builds" | "projects";

/** The props each event carries (METRICS.md). Ids and numbers only, never prompt text. */
export interface EventProps {
  "user.signed_in": { method: "magic_link" };
  "project.created": { source: "prompt" | "starter"; starter_slug?: string };
  "project.opened": Record<string, never>;
  "build.started": { generation_id: string; kind: "initial" | "edit"; model: string };
  "build.step": { generation_id: string; step: string; status: string; duration_ms: number };
  "build.repair": { generation_id: string; attempt: number; source: "typecheck" | "bundle" };
  "build.finished": {
    generation_id: string;
    kind: "initial" | "edit";
    status: string;
    repair_attempts: number;
    wall_ms: number;
    input_tokens: number;
    cached_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
  "build.cancelled": { generation_id: string };
  "preview.web_loaded": { project_id: string; load_ms?: number };
  "preview.phone_opened": { project_id: string };
  "preview.reset_demo_data": { project_id: string };
  "snapshot.restored": { project_id: string; snapshot_id: string };
  "export.created": { project_id: string; zip_bytes: number };
  "cap.hit": { cap: CapName };
}
