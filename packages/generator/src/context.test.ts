import { describe, expect, it } from "vitest";
import { readApiDigest, readManifest } from "@buildly/foundation";
import { loadStarterFiles } from "@buildly/starters";
import {
  buildContext,
  CONTEXT_TOKEN_BUDGET,
  ContextTooLargeError,
  estimateTokens,
  toProviderInput,
  windowHistory,
  type HistoryMessage,
} from "./context";
import { ProjectFiles } from "./tools/project-files";

const manifest = readManifest();
const apiDigest = readApiDigest();
const journal = loadStarterFiles("journal");
const input = {
  manifest,
  apiDigest,
  files: journal,
  history: [],
  userMessage: "Add a Favorites tab showing starred entries",
};

describe("buildContext", () => {
  it("builds the journal starter context in §5 order (snapshot)", () => {
    const messages = buildContext(input);
    expect(messages.map((m) => m.role)).toEqual(["system", "developer", "developer", "user"]);
    expect(messages[1]!.content).toBe(apiDigest.trimEnd());
    expect(messages[2]!.content).toContain("## src/navigation.tsx");
    expect(messages.at(-1)!.content).toBe("Add a Favorites tab showing starred entries");
    expect(messages).toMatchSnapshot();
  });

  it("keeps the first three messages byte-identical between turn 1 and turn 2 of a run", () => {
    const files = new ProjectFiles(journal);
    const turn1 = buildContext({ ...input, files: files.toFileSet() });
    // Turn 1 edits a file; turn 2 rebuilds the context from the same base snapshot.
    files.write(
      "src/screens/FavoritesScreen.tsx",
      "export function FavoritesScreen() { return null; }\n",
    );
    const turn2 = buildContext(input);
    for (let i = 0; i < 3; i++) expect(turn2[i]!.content).toBe(turn1[i]!.content);
    expect(JSON.stringify(toProviderInput(turn2).input.slice(0, 2))).toBe(
      JSON.stringify(toProviderInput(turn1).input.slice(0, 2)),
    );
    expect(toProviderInput(turn2).instructions).toBe(toProviderInput(turn1).instructions);
  });

  it("puts the hard rules from foundation.json in the system prompt", () => {
    const system = buildContext(input)[0]!.content;
    expect(system).toContain("src/screens/**/*.tsx");
    expect(system).toContain("@react-native-async-storage/async-storage");
    expect(system).toContain(manifest.schemaVersionRule);
    expect(system).toContain("package.json");
  });

  it("fits the journal starter well inside the budget", () => {
    const tokens = estimateTokens(buildContext(input));
    expect(tokens).toBeGreaterThan(5_000);
    expect(tokens).toBeLessThan(CONTEXT_TOKEN_BUDGET / 2);
  });
});

describe("token budget", () => {
  it("summarizes history beyond 20 messages into one message", () => {
    const history: HistoryMessage[] = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message ${i + 1}\nsecond line that the summary leaves out`,
    }));
    const windowed = windowHistory(history);
    expect(windowed).toHaveLength(21);
    expect(windowed[0]).toEqual({
      role: "developer",
      content: [
        "Summary of the 5 earlier messages in this project:",
        "- User asked: message 1",
        "- Builder replied: message 2",
        "- User asked: message 3",
        "- Builder replied: message 4",
        "- User asked: message 5",
      ].join("\n"),
    });
    expect(windowed.slice(1)).toEqual(history.slice(5));

    const messages = buildContext({ ...input, history });
    expect(messages.filter((m) => m.content.startsWith("Summary of the 5 earlier"))).toHaveLength(
      1,
    );
    expect(windowHistory(history.slice(0, 20))).toEqual(history.slice(0, 20));
  });

  it("fails fast with context_too_large for an oversized project", () => {
    const huge = { ...journal };
    for (let i = 0; i < 40; i++)
      huge[`src/screens/Generated${i}.tsx`] =
        `export const data${i} = ${JSON.stringify("lorem ipsum dolor sit amet ".repeat(400))};\n`;
    let thrown: unknown;
    try {
      buildContext({ ...input, files: huge });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ContextTooLargeError);
    expect(thrown).toMatchObject({ code: "context_too_large" });
    expect((thrown as ContextTooLargeError).tokens).toBeGreaterThan(CONTEXT_TOKEN_BUDGET);
  });
});
