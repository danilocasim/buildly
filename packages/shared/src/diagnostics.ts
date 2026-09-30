// One diagnostic shape for everything the repair loop reads: tsc output, Snack bundle
// errors, and runtime errors the foundation logs (SPIKES.md S1).
export interface Diagnostic {
  source: "typecheck" | "bundle" | "runtime";
  /** Project-relative POSIX path, when known. */
  file?: string;
  line?: number;
  col?: number;
  /** tsc error code such as "TS2322". */
  code?: string;
  message: string;
}

const TSC_LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

/**
 * Parses `tsc --pretty false` output. Continuation lines (indented) belong to the
 * previous diagnostic's message.
 */
export function parseTscOutput(output: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = TSC_LINE.exec(line);
    if (match) {
      diagnostics.push({
        source: "typecheck",
        file: match[1]!.replace(/\\/g, "/"),
        line: Number(match[2]),
        col: Number(match[3]),
        code: match[4]!,
        message: match[5]!,
      });
    } else if (/^\s+\S/.test(line) && diagnostics.length > 0) {
      diagnostics[diagnostics.length - 1]!.message += `\n${line.trim()}`;
    }
  }
  return diagnostics;
}

/** The error a Snack connected client reports (`connectedClients[*].error`). */
export interface SnackErrorPayload {
  message: string;
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
}

/** Snack module paths look like "module://src/App.tsx.js"; report the source path. */
function snackPath(fileName: string | undefined): string | undefined {
  if (!fileName) return undefined;
  return fileName.replace(/^module:\/\//, "").replace(/\.(tsx|ts|jsx)\.js$/, ".$1");
}

export function fromSnackError(error: SnackErrorPayload): Diagnostic {
  return {
    source: "bundle",
    file: snackPath(error.fileName),
    line: error.lineNumber,
    col: error.columnNumber,
    // Snack prefixes bundle errors with the file path; keep the first line only.
    message: error.message.split("\n")[0]!.trim(),
  };
}

/** Must match RUNTIME_ERROR_PREFIX in packages/foundation/src/components/ErrorBoundary.tsx. */
export const RUNTIME_ERROR_PREFIX = "[buildly:runtime-error]";

/** A device log line from the foundation's error boundary or global handler, if it is one. */
export function fromRuntimeLog(line: string): Diagnostic | undefined {
  const start = line.indexOf(RUNTIME_ERROR_PREFIX);
  if (start < 0) return undefined;
  try {
    const report = JSON.parse(line.slice(start + RUNTIME_ERROR_PREFIX.length)) as {
      message?: unknown;
      file?: unknown;
      line?: unknown;
      column?: unknown;
    };
    return {
      source: "runtime",
      file: typeof report.file === "string" ? report.file : undefined,
      line: typeof report.line === "number" ? report.line : undefined,
      col: typeof report.column === "number" ? report.column : undefined,
      message: typeof report.message === "string" ? report.message : "Unknown runtime error",
    };
  } catch {
    return { source: "runtime", message: line.slice(start + RUNTIME_ERROR_PREFIX.length).trim() };
  }
}

/** One line per diagnostic, as the repair prompt shows them. */
export function formatDiagnostic(d: Diagnostic): string {
  const where = d.file
    ? `${d.file}${d.line ? `:${d.line}${d.col ? `:${d.col}` : ""}` : ""}`
    : "(unknown file)";
  return `${where} [${d.source}${d.code ? ` ${d.code}` : ""}] ${d.message}`;
}
