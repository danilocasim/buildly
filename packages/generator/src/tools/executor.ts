// The five model tools (ARCHITECTURE.md §4) executed against the in-memory project.
// Every rejection is returned to the model as a tool error with its reason and counts
// toward the run's budget; the 11th rejection fails the run.
import type { FoundationManifest } from "@buildly/shared";
import type { ToolDefinition } from "../provider";
import type { FileSet, ProjectFiles } from "./project-files";
import {
  checkImports,
  checkRead,
  checkSize,
  checkWrite,
  type Rejection,
  type RejectionReason,
} from "./validation";

export const REJECTION_BUDGET = 10;

const pathParam = {
  path: { type: "string", description: 'Relative path, for example "src/screens/HomeScreen.tsx".' },
};
const objectSchema = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "list_files",
    description: "List the project's own files (foundation files are not listed).",
    parameters: objectSchema({}),
  },
  {
    name: "read_file",
    description: "Read a project file or a read-only foundation file.",
    parameters: objectSchema(pathParam),
  },
  {
    name: "write_file",
    description: "Create or replace a project file with its full contents.",
    parameters: objectSchema({
      ...pathParam,
      contents: { type: "string", description: "The complete new file contents." },
    }),
  },
  {
    name: "delete_file",
    description: "Delete a project file.",
    parameters: objectSchema(pathParam),
  },
  {
    name: "finish",
    description:
      "End the edit when the app is complete. Summarize what changed and list every screen by its user-facing name.",
    parameters: objectSchema({
      summary: { type: "string", description: "One paragraph for the user." },
      screens: {
        type: "array",
        items: { type: "string" },
        description: 'Screen names, for example "Entries", "Entry detail".',
      },
    }),
  },
];

export interface FinishResult {
  summary: string;
  /** Screens that a route in src/navigation.tsx registers. */
  screens: string[];
  warnings: string[];
}

export interface RecordedRejection extends Rejection {
  tool: string;
}

export class RejectionBudgetExceeded extends Error {
  constructor(readonly rejections: RecordedRejection[]) {
    super(`More than ${REJECTION_BUDGET} tool calls were rejected; the run stops.`);
    this.name = "RejectionBudgetExceeded";
  }
}

export interface ToolCall {
  name: string;
  arguments: string;
}

const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Route names registered in a navigation file: `<X.Screen name="..." />`. */
export function registeredRoutes(navigation: string | undefined): string[] {
  return [...(navigation ?? "").matchAll(/<\w+\.Screen\b[^>]*?\bname=["']([^"']+)["']/g)].map(
    (m) => m[1]!,
  );
}

/** Keeps the screens whose name matches a registered route ("Entry detail" ↔ "EntryDetail"). */
export function validateScreens(
  screens: string[],
  files: { read(path: string): string | undefined },
) {
  const routes = new Set(registeredRoutes(files.read("src/navigation.tsx")).map(normalizeName));
  const kept: string[] = [];
  const warnings: string[] = [];
  for (const screen of screens) {
    if (routes.has(normalizeName(screen))) kept.push(screen);
    else
      warnings.push(
        `Screen "${screen}" has no route in src/navigation.tsx and was left out of the screen list.`,
      );
  }
  return { screens: kept, warnings };
}

export class ToolExecutor {
  readonly rejections: RecordedRejection[] = [];
  /** Set by the finish tool; read with finishResult(). */
  finished?: FinishResult;
  private readonly allowlist: string[];

  constructor(
    private readonly files: ProjectFiles,
    private readonly foundation: FileSet,
    private readonly manifest: FoundationManifest,
    private readonly budget = REJECTION_BUDGET,
  ) {
    this.allowlist = Object.keys(manifest.dependencies);
  }

  /** The last finish call's result, if the model has finished since resetFinish(). */
  finishResult(): FinishResult | undefined {
    return this.finished;
  }

  /** Clears the finish state before a repair pass. */
  resetFinish(): void {
    this.finished = undefined;
  }

  /** Runs one tool call and returns the text the model sees. */
  execute(call: ToolCall): string {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(call.arguments) as Record<string, unknown>;
    } catch {
      return this.reject(call.name, {
        reason: "invalid_arguments",
        message: "Arguments must be valid JSON.",
      });
    }
    const layout = this.manifest.layout;
    switch (call.name) {
      case "list_files":
        return this.files.list().join("\n") || "(no project files yet)";

      case "read_file": {
        const path = typeof args.path === "string" ? args.path : "";
        const allowed = checkRead(path, layout);
        if (!allowed.ok) return this.reject(call.name, allowed.error);
        const contents = this.files.read(path) ?? this.foundation[path];
        // A missing file is information, not a mistake: it does not spend the budget.
        return contents ?? `not found: ${path} does not exist yet.`;
      }

      case "write_file": {
        const path = typeof args.path === "string" ? args.path : "";
        const contents = typeof args.contents === "string" ? args.contents : undefined;
        if (contents === undefined)
          return this.reject(call.name, {
            reason: "invalid_arguments",
            message: "contents must be a string.",
          });
        for (const check of [checkWrite(path, layout), checkSize(contents)]) {
          if (!check.ok) return this.reject(call.name, check.error);
        }
        if (/\.(tsx?|jsx?)$/.test(path)) {
          const imports = checkImports(path, contents, this.allowlist);
          if (!imports.ok) return this.reject(call.name, imports.error);
        }
        this.files.write(path, contents);
        return `ok: wrote ${path}`;
      }

      case "delete_file": {
        const path = typeof args.path === "string" ? args.path : "";
        const allowed = checkWrite(path, layout);
        if (!allowed.ok) return this.reject(call.name, allowed.error);
        return this.files.delete(path)
          ? `ok: deleted ${path}`
          : `not found: ${path} does not exist.`;
      }

      case "finish": {
        const summary = typeof args.summary === "string" ? args.summary.trim() : "";
        const screens = Array.isArray(args.screens)
          ? args.screens.filter((s): s is string => typeof s === "string")
          : [];
        this.finished = { summary, ...validateScreens(screens, this.files) };
        return "ok: finished";
      }

      default:
        return this.reject(call.name, {
          reason: "invalid_arguments",
          message: `Unknown tool "${call.name}".`,
        });
    }
  }

  private reject(tool: string, rejection: Rejection): string {
    this.rejections.push({ tool, ...rejection });
    if (this.rejections.length > this.budget) throw new RejectionBudgetExceeded(this.rejections);
    return `error: ${rejection.reason}: ${rejection.message}`;
  }
}

export type { RejectionReason };
