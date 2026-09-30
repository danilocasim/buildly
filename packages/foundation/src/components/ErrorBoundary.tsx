import { Component, type ErrorInfo, type ReactNode } from "react";
import { Text, View } from "react-native";
import { tokens } from "../theme";

// Snack shows runtime errors on the device but does not report them to the SDK
// (SPIKES.md S1); console output is forwarded. Every runtime error is logged as one
// line with this prefix and a JSON payload so the preview wrapper can read it back.
export const RUNTIME_ERROR_PREFIX = "[buildly:runtime-error]";

export interface RuntimeErrorReport {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  fatal: boolean;
}

const LOCATION =
  /(?:module:\/\/)?((?:[\w.-]+\/)*[\w.-]+\.(?:tsx|ts|jsx|js))(?:\.js)?:(\d+)(?::(\d+))?/;

/** First project-file location in a stack trace, skipping dependencies. */
export function locateError(
  stack: string | undefined,
): Pick<RuntimeErrorReport, "file" | "line" | "column"> {
  for (const line of (stack ?? "").split("\n")) {
    if (line.includes("node_modules")) continue;
    const match = LOCATION.exec(line);
    if (match) {
      // Snack serves modules as "<path>.tsx.js"; report the source path.
      const file = match[1].replace(/\.(tsx|ts|jsx)\.js$/, ".$1");
      return { file, line: Number(match[2]), column: match[3] ? Number(match[3]) : undefined };
    }
  }
  return {};
}

export function reportRuntimeError(error: unknown, fatal: boolean): RuntimeErrorReport {
  const err = error instanceof Error ? error : new Error(String(error));
  const report: RuntimeErrorReport = { message: err.message, ...locateError(err.stack), fatal };
  console.error(`${RUNTIME_ERROR_PREFIX} ${JSON.stringify(report)}`);
  return report;
}

interface ErrorUtilsLike {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

let installed = false;

/** Logs uncaught errors (including ones outside React rendering), then defers to React Native. */
export function installGlobalErrorHandler(): void {
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (installed || !errorUtils) return;
  installed = true;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    reportRuntimeError(error, !!isFatal);
    previous(error, isFatal);
  });
}

interface State {
  error?: Error;
}

/** Catches render errors, logs them, and shows a readable fallback instead of a blank app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo) {
    reportRuntimeError(error, true);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    const t = tokens;
    return (
      <View
        testID="error-boundary"
        style={{
          flex: 1,
          justifyContent: "center",
          padding: t.space.xl,
          gap: t.space.sm,
          backgroundColor: t.color.background,
        }}
      >
        <Text style={[t.type.title, { color: t.color.text }]}>Something went wrong</Text>
        <Text style={[t.type.body, { color: t.color.textMuted }]}>{this.state.error.message}</Text>
      </View>
    );
  }
}
