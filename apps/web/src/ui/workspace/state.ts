// Client-side workspace state: the server-loaded snapshot plus progress events applied as
// they arrive. Steps turn green only from stored server events (never from model text).
import { failureCopy } from "@buildly/shared";
import type { WorkspaceState } from "@/src/server/workspace";

export type Generation = WorkspaceState["generations"][number];
export type Message = WorkspaceState["messages"][number];

export const ACTIVE_STATUSES = new Set([
  "queued",
  "planning",
  "editing",
  "checking",
  "bundling",
  "repairing",
]);

export const STEP_LABELS = [
  ["plan", "Plan ready"],
  ["edit", "Files written"],
  ["typecheck", "Types checked"],
  ["bundle", "Preview bundled"],
] as const;
export type StepKey = (typeof STEP_LABELS)[number][0];
export type StepState = "done" | "failed" | "running" | "pending";

export interface ProgressEvent {
  id: number;
  type: string;
  generationId: string | null;
  payload: Record<string, unknown>;
}

/** Per-generation progress derived from events (what the UI renders). */
export interface Progress {
  done: Set<StepKey>;
  failed?: StepKey;
  repairAttempt?: number;
  status?: string;
  errorCode?: string | null;
  snapshotId?: string;
}

export interface ClientState extends WorkspaceState {
  progress: Record<string, Progress>;
  /** Streamed assistant text per generation until its plan is stored. */
  streaming: Record<string, string>;
}

const DONE_BY_EVENT: Record<string, StepKey> = {
  plan_ready: "plan",
  files_written: "edit",
  types_checked: "typecheck",
  preview_bundled: "bundle",
};
const FAILED_BY_EVENT: Record<string, StepKey> = {
  typecheck_failed: "typecheck",
  bundle_failed: "bundle",
};

const str = (value: unknown): string => (typeof value === "string" ? value : "");

export function fromServer(state: WorkspaceState): ClientState {
  // Recorded steps give the progress of finished generations on a fresh page load.
  const progress: Record<string, Progress> = {};
  for (const g of state.generations) {
    const p: Progress = { done: new Set(), status: g.status, errorCode: g.errorCode };
    for (const s of g.steps) {
      if (s.step === "repair") {
        p.repairAttempt = Number(s.detail?.attempt ?? p.repairAttempt ?? 0);
        p.done.delete("typecheck");
        p.done.delete("bundle");
        p.failed = undefined;
      } else if (s.step === "snapshot") {
        if (s.status === "succeeded") p.snapshotId = str(s.detail?.snapshotId);
      } else if (s.status === "succeeded") p.done.add(s.step);
      else p.failed = s.step;
    }
    progress[g.id] = p;
  }
  return { ...state, progress, streaming: {} };
}

export function applyEvent(state: ClientState, event: ProgressEvent): ClientState {
  if (!event.generationId) return { ...state, lastEventId: event.id };
  const id = event.generationId;
  const prev = state.progress[id] ?? { done: new Set<StepKey>(), status: "queued" };
  const p: Progress = { ...prev, done: new Set(prev.done) };
  const done = DONE_BY_EVENT[event.type];
  const failed = FAILED_BY_EVENT[event.type];
  if (done) p.done.add(done);
  if (failed) p.failed = failed;
  if (event.type === "repair_started") {
    p.repairAttempt = Number(event.payload.attempt ?? 0);
    p.failed = undefined;
    p.done.delete("typecheck");
    p.done.delete("bundle");
  }
  if (event.type === "snapshot_created") p.snapshotId = str(event.payload.snapshotId);
  if (event.type === "finished") {
    p.status = str(event.payload.status) || "failed";
    p.errorCode = (event.payload.errorCode as string | null | undefined) ?? null;
  } else if (!p.status || p.status === "queued") p.status = "planning";
  const streaming = { ...state.streaming };
  if (event.type === "plan_ready") delete streaming[id];
  const generations = state.generations.some((g) => g.id === id)
    ? state.generations.map((g) =>
        g.id === id && event.type === "finished"
          ? {
              ...g,
              status: p.status as Generation["status"],
              errorCode: p.errorCode ?? null,
              resultSnapshotId: p.snapshotId ?? g.resultSnapshotId,
            }
          : g,
      )
    : state.generations;
  const project =
    event.type === "snapshot_created" && p.snapshotId
      ? { ...state.project, currentSnapshotId: p.snapshotId }
      : state.project;
  return {
    ...state,
    project,
    generations,
    progress: { ...state.progress, [id]: p },
    streaming,
    lastEventId: Math.max(state.lastEventId, event.id),
  };
}

export function applyDelta(state: ClientState, generationId: string, text: string): ClientState {
  if (state.progress[generationId]?.done.has("plan")) return state;
  return {
    ...state,
    streaming: { ...state.streaming, [generationId]: (state.streaming[generationId] ?? "") + text },
  };
}

export function stepStates(p: Progress | undefined, active: boolean): Record<StepKey, StepState> {
  const result = {} as Record<StepKey, StepState>;
  let runningAssigned = false;
  for (const [key] of STEP_LABELS) {
    if (p?.done.has(key)) result[key] = "done";
    else if (p?.failed === key) result[key] = "failed";
    else if (active && !runningAssigned && !p?.failed) {
      result[key] = "running";
      runningAssigned = true;
    } else result[key] = "pending";
  }
  return result;
}

export function isActive(g: { status: string }): boolean {
  return ACTIVE_STATUSES.has(g.status);
}

/** The terminal state's headline (TODO 7.3.3; the copy lives in @buildly/shared failures.ts). */
export function outcomeText(status: string, errorCode: string | null | undefined): string {
  return failureCopy(status, errorCode)?.title ?? "Build succeeded";
}
