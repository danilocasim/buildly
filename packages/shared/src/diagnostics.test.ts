import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatDiagnostic,
  fromRuntimeLog,
  fromSnackError,
  parseTscOutput,
  RUNTIME_ERROR_PREFIX,
} from "./diagnostics";

describe("diagnostics", () => {
  it("parses tsc output, including continuation lines", () => {
    const output = [
      "src/screens/Home.tsx(3,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/navigation.tsx(19,35): error TS2322: Type '({ navigation }: Props) => Element' is not assignable to type 'ScreenComponentType'.",
      "  Types of parameters 'props' are incompatible.",
      "",
    ].join("\n");
    expect(parseTscOutput(output)).toEqual([
      {
        source: "typecheck",
        file: "src/screens/Home.tsx",
        line: 3,
        col: 7,
        code: "TS2322",
        message: "Type 'string' is not assignable to type 'number'.",
      },
      {
        source: "typecheck",
        file: "src/navigation.tsx",
        line: 19,
        col: 35,
        code: "TS2322",
        message:
          "Type '({ navigation }: Props) => Element' is not assignable to type 'ScreenComponentType'.\nTypes of parameters 'props' are incompatible.",
      },
    ]);
  });

  it("converts a Snack error payload and a tsc diagnostic to the same shape", () => {
    const fromSnack = fromSnackError({
      message: "module://src/screens/Home.tsx.js: Unexpected token (3:20)\n  1 | import x",
      fileName: "module://src/screens/Home.tsx.js",
      lineNumber: 3,
      columnNumber: 20,
    });
    const [fromTsc] = parseTscOutput(
      "src/screens/Home.tsx(3,20): error TS1109: Expression expected.",
    );
    expect(fromSnack).toEqual({
      source: "bundle",
      file: "src/screens/Home.tsx",
      line: 3,
      col: 20,
      message: "module://src/screens/Home.tsx.js: Unexpected token (3:20)",
    });
    expect(Object.keys(fromSnack).sort()).toEqual(
      Object.keys(fromTsc!)
        .filter((k) => k !== "code")
        .sort(),
    );
    expect({ file: fromSnack.file, line: fromSnack.line, col: fromSnack.col }).toEqual({
      file: fromTsc!.file,
      line: fromTsc!.line,
      col: fromTsc!.col,
    });
  });

  it("reads the foundation's runtime error log lines", () => {
    const line = `${RUNTIME_ERROR_PREFIX} {"message":"boom","file":"src/screens/Home.tsx","line":9,"column":2,"fatal":true}`;
    expect(fromRuntimeLog(line)).toEqual({
      source: "runtime",
      file: "src/screens/Home.tsx",
      line: 9,
      col: 2,
      message: "boom",
    });
    expect(fromRuntimeLog("ordinary log line")).toBeUndefined();
    expect(fromRuntimeLog(`${RUNTIME_ERROR_PREFIX} not json`)).toEqual({
      source: "runtime",
      message: "not json",
    });
  });

  it("keeps the prefix in step with the foundation", () => {
    const foundation = readFileSync(
      new URL("../../foundation/src/components/ErrorBoundary.tsx", import.meta.url),
      "utf8",
    );
    expect(foundation).toContain(`RUNTIME_ERROR_PREFIX = "${RUNTIME_ERROR_PREFIX}"`);
  });

  it("formats one line per diagnostic", () => {
    expect(
      formatDiagnostic({
        source: "typecheck",
        file: "a.ts",
        line: 1,
        col: 2,
        code: "TS1",
        message: "m",
      }),
    ).toBe("a.ts:1:2 [typecheck TS1] m");
    expect(formatDiagnostic({ source: "runtime", message: "m" })).toBe(
      "(unknown file) [runtime] m",
    );
  });
});
