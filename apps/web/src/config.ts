import { loadConfig, type WebConfig } from "@buildly/shared/config";

/** Validated server env for the web app. The web app never receives the OpenAI key. */
export function loadWebConfig(env: NodeJS.ProcessEnv = process.env): WebConfig {
  return loadConfig("web", env);
}
