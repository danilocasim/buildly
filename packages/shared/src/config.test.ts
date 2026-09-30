import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ConfigError, ENV_NAMES, loadConfig } from "./config";

// .env.example doubles as the complete-environment fixture, which also keeps it in
// step with the schema.
const example = parseDotenv(
  readFileSync(new URL("../../../.env.example", import.meta.url), "utf8"),
);

function parseDotenv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) env[match[1]!] = match[2]!;
  }
  return env;
}

function without(name: string): Record<string, string> {
  const { [name]: _removed, ...rest } = example;
  return rest;
}

describe("loadConfig", () => {
  it("parses a complete environment for each service", () => {
    expect(loadConfig("worker", example).OPENAI_API_KEY).toBe("replace-me");
    expect(loadConfig("web", example).SESSION_SECRET).toBe(example.SESSION_SECRET);
  });

  it("throws an error naming a missing OPENAI_API_KEY", () => {
    expect(() => loadConfig("worker", without("OPENAI_API_KEY"))).toThrow(
      /OPENAI_API_KEY is required/,
    );
  });

  it("lists every invalid variable on the error", () => {
    const env = { ...without("DATABASE_URL"), APP_URL: "not a url" };
    try {
      loadConfig("worker", env);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).variables.sort()).toEqual(["APP_URL", "DATABASE_URL"]);
    }
  });

  it("never puts values in the error message", () => {
    const env = { ...example, OPENAI_API_KEY: "", APP_URL: "secret-looking-value" };
    expect(() => loadConfig("worker", env)).toThrow(/APP_URL must be a valid url/);
    expect(() => loadConfig("worker", env)).not.toThrow(/secret-looking-value/);
  });

  it("does not give the web app the OpenAI key or model names", () => {
    const web = loadConfig("web", example);
    expect(web).not.toHaveProperty("OPENAI_API_KEY");
    expect(web).not.toHaveProperty("GENERATION_MODEL_PLAN");
    expect(() => loadConfig("web", without("OPENAI_API_KEY"))).not.toThrow();
  });

  it("treats empty optional variables as unset", () => {
    const worker = loadConfig("worker", { ...example, STORAGE_ENDPOINT: "" });
    expect(worker.STORAGE_ENDPOINT).toBeUndefined();
    expect(worker.SENTRY_DSN).toBeUndefined();
  });

  it("rejects a short SESSION_SECRET", () => {
    expect(() => loadConfig("web", { ...example, SESSION_SECRET: "short" })).toThrow(
      /SESSION_SECRET must be at least 32 characters/,
    );
  });
});

describe("ENV_NAMES", () => {
  it("matches the variables documented in .env.example", () => {
    expect([...ENV_NAMES].sort()).toEqual(Object.keys(example).sort());
  });
});
