// Builds the model's context (ARCHITECTURE.md §5): system prompt, foundation API digest,
// the project's files at the start of the build, conversation history, then the user's
// message. The first three are byte-identical on every turn of a run, so the provider's
// prompt cache keeps hitting; files edited during the run reach the model as tool results.
import { countTokens } from "gpt-tokenizer/encoding/o200k_base";
import type { FoundationManifest } from "@buildly/shared";
import type { InputItem } from "./provider";
import type { FileSet } from "./tools/project-files";

export const CONTEXT_TOKEN_BUDGET = 80_000;
export const HISTORY_WINDOW = 20;

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ContextMessage {
  role: "system" | "developer" | "user" | "assistant";
  content: string;
}

export class ContextTooLargeError extends Error {
  readonly code = "context_too_large";
  constructor(readonly tokens: number) {
    super(
      `The project and conversation need about ${tokens.toLocaleString("en-US")} tokens; the limit is ${CONTEXT_TOKEN_BUDGET.toLocaleString("en-US")}.`,
    );
    this.name = "ContextTooLargeError";
  }
}

export function systemPrompt(manifest: FoundationManifest): string {
  const { layout } = manifest;
  return `You build and edit React Native + Expo (SDK ${manifest.sdkVersion.split(".")[0]}) + TypeScript apps for Buildly users, on a fixed foundation, using only the provided tools.

How to work:
1. First reply with a short plan in plain text: the screens, the data models, and the navigation. Keep it under 120 words. If the request needs a package that is not in the import list below, start the plan by saying so: name the package and say it is not available in Buildly apps.
2. Then make the changes with the tools. Read a file before you change it. write_file replaces the whole file, so always send complete contents.
3. Work in as few turns as you can. Call several tools in one turn when they do not depend on each other, write each file once, and do not re-read a file you just wrote. A build stops after 4 minutes, so finish well before that.
4. When the app is complete, call finish once with a one-paragraph summary for the user and every screen's user-facing name. Always end with finish, even if you changed nothing.

Shaping the app:
- Cover every feature the user names. A named action, such as "log a meal", gets its own screen or flow named after it (LogMealScreen).
- Name data types after the user's nouns in their simplest form (for a recipe app: Recipe, Ingredient). Name each screen and route after what it shows (RecipesScreen, RecipeDetailScreen), and replace the template's placeholder Home screen instead of keeping a generic Home.
- When the user adjusts, logs, or tracks something, store each event as its own record in its own collection (for a fitness app: a Workout per session), with the change it made, not only the latest total. That record is the history the app shows.
- Seed believable demo data: at least 3 records in every main collection, so every screen has something to show.

Hard rules:
- Write only these paths: ${layout.writable.join(", ")}.
- These are part of the foundation and read-only: ${layout.readOnly.join(", ")}. Never try to edit them.
- Never create: ${layout.forbidden.join(", ")}.
- Import only these packages: ${Object.keys(manifest.dependencies).join(", ")}. Everything else must be a relative import of project or foundation files. If the user asks for something that needs another package, do not imitate it or work around it: build what you can with the allowed packages and explain in your summary that the package is not available.
- Persist data only through createRepository from src/data/store.ts, never AsyncStorage directly.
- ${manifest.schemaVersionRule}
- TypeScript strict mode must pass. Use the foundation components and useTheme(); never hard-code colors.
- Screens take no props; read navigation and params with useNavigation and useRoute.
- Keep the About tab registered.`;
}

const LANGUAGES: Record<string, string> = { tsx: "tsx", ts: "ts", json: "json", js: "js" };

/** The project's files, sorted by path, as one deterministic message. */
export function projectFilesMessage(files: FileSet): string {
  const paths = Object.keys(files).sort();
  if (paths.length === 0)
    return "# Project files\n\nThe project has no files yet; it starts from the bare foundation.";
  const sections = paths.map((path) => {
    const language = LANGUAGES[path.split(".").pop() ?? ""] ?? "";
    return `## ${path}\n\n\`\`\`${language}\n${files[path]!.replace(/\n$/, "")}\n\`\`\``;
  });
  return `# Project files (as of the start of this build)\n\n${sections.join("\n\n")}`;
}

const firstLine = (text: string, max = 200) => {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/**
 * Keeps the last HISTORY_WINDOW messages; older ones become one summary message listing
 * what the user asked for and what was reported back, so long projects keep their thread.
 */
export function windowHistory(history: HistoryMessage[]): ContextMessage[] {
  if (history.length <= HISTORY_WINDOW) return history;
  const older = history.slice(0, history.length - HISTORY_WINDOW);
  const recent = history.slice(-HISTORY_WINDOW);
  const lines = older.map(
    (m) => `- ${m.role === "user" ? "User asked" : "Builder replied"}: ${firstLine(m.content)}`,
  );
  return [
    {
      role: "developer",
      content: `Summary of the ${older.length} earlier messages in this project:\n${lines.join("\n")}`,
    },
    ...recent,
  ];
}

export interface ContextInput {
  manifest: FoundationManifest;
  apiDigest: string;
  /** Project files at the start of the build (the base snapshot). */
  files: FileSet;
  history: HistoryMessage[];
  userMessage: string;
}

/** Messages in §5 order. messages[0..2] are the cacheable prefix. */
export function buildContext(input: ContextInput): ContextMessage[] {
  const messages: ContextMessage[] = [
    { role: "system", content: systemPrompt(input.manifest) },
    { role: "developer", content: input.apiDigest.trimEnd() },
    { role: "developer", content: projectFilesMessage(input.files) },
    ...windowHistory(input.history),
    { role: "user", content: input.userMessage },
  ];
  const tokens = estimateTokens(messages);
  if (tokens > CONTEXT_TOKEN_BUDGET) throw new ContextTooLargeError(tokens);
  return messages;
}

export function estimateTokens(messages: ContextMessage[]): number {
  // A few tokens of per-message framing on top of the content.
  return messages.reduce((sum, m) => sum + countTokens(m.content) + 4, 0);
}

/** Splits built messages into the provider's `instructions` and `input`. */
export function toProviderInput(messages: ContextMessage[]): {
  instructions: string;
  input: InputItem[];
} {
  const [system, ...rest] = messages;
  return {
    instructions: system?.role === "system" ? system.content : "",
    input: (system?.role === "system" ? rest : messages).map((m) => ({
      role: m.role === "system" ? "developer" : m.role,
      content: m.content,
    })),
  };
}
