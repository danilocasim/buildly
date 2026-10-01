// Model routing (D16, brief §9): plans and initial builds use GENERATION_MODEL_PLAN;
// follow-up edits and every repair use GENERATION_MODEL_EDIT. Required for the pricing:
// the flagship alone costs about $0.12 per build, routing keeps the blend near $0.04.
import { isRatedModel } from "./rates";

export interface ModelConfig {
  /** GENERATION_MODEL_PLAN */
  plan: string;
  /** GENERATION_MODEL_EDIT */
  edit: string;
}

export type BuildKind = "initial" | "edit";
export type Stage = "plan" | "build" | "repair";

export function modelFor(kind: BuildKind, stage: Stage, models: ModelConfig): string {
  if (stage === "repair") return models.edit;
  return kind === "initial" ? models.plan : models.edit;
}

/** The model stored on `generations.model`: the one that plans and builds this kind of run. */
export function primaryModel(kind: BuildKind, models: ModelConfig): string {
  return modelFor(kind, "build", models);
}

/** Validates the worker's model config at startup, so cost accounting cannot fail mid-run. */
export function modelsFromConfig(config: {
  GENERATION_MODEL_PLAN: string;
  GENERATION_MODEL_EDIT: string;
}): ModelConfig {
  const models = { plan: config.GENERATION_MODEL_PLAN, edit: config.GENERATION_MODEL_EDIT };
  for (const [name, model] of Object.entries(models)) {
    if (!isRatedModel(model))
      throw new Error(`GENERATION_MODEL_${name.toUpperCase()}="${model}" has no rate in rates.ts`);
  }
  return models;
}
