// --dry-run: a scripted provider that makes no API calls, so the harness, checks, and
// report can be exercised for free. T1 replays the journal starter, T7 restores the file
// the task broke, and every other task finishes without changes.
import type { Provider, ProviderEvent, ProviderRequest, Usage } from "@buildly/generator";
import { loadStarterFiles } from "@buildly/starters";
import type { EvalTask } from "./tasks";

export const DRY_RUN_USAGE: Usage = {
  inputTokens: 8_000,
  cachedTokens: 4_000,
  cacheWriteTokens: 0,
  outputTokens: 600,
};

function writesFor(task: EvalTask): Record<string, string> {
  if (task.id === "T1") return loadStarterFiles("journal");
  if (task.id === "T7") {
    const path = "src/screens/EntriesScreen.tsx";
    return { [path]: loadStarterFiles("journal")[path]! };
  }
  return {};
}

const screensFor = (task: EvalTask) => (task.id === "T1" ? ["Entries", "Entry detail"] : []);

export function dryRunProvider(task: EvalTask): Provider & { requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  return {
    requests,
    async *stream(request): AsyncIterable<ProviderEvent> {
      requests.push(request);
      await Promise.resolve();
      const turn = requests.length;
      if (turn === 1) {
        yield { type: "text_delta", delta: `Dry run of ${task.id}: replaying a fixed script.` };
        for (const [i, [path, contents]] of Object.entries(writesFor(task)).entries()) {
          yield {
            type: "tool_call",
            callId: `dry_${turn}_${i}`,
            name: "write_file",
            arguments: JSON.stringify({ path, contents }),
          };
        }
      } else {
        yield {
          type: "tool_call",
          callId: `dry_${turn}_finish`,
          name: "finish",
          arguments: JSON.stringify({
            summary: `Dry run of ${task.id} finished.`,
            screens: screensFor(task),
          }),
        };
      }
      yield { type: "done", responseId: `dry_${turn}`, model: request.model, usage: DRY_RUN_USAGE };
    },
  };
}
