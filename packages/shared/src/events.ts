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
