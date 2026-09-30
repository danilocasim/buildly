import { render, screen } from "@testing-library/react-native";
import {
  ErrorBoundary,
  locateError,
  reportRuntimeError,
  RUNTIME_ERROR_PREFIX,
} from "../src/components";

function Boom(): never {
  throw new Error("S1 runtime throw");
}

function parseLog(spy: jest.SpyInstance) {
  const line = spy.mock.calls
    .map((args) => String(args[0]))
    .find((l) => l.startsWith(RUNTIME_ERROR_PREFIX));
  return line ? JSON.parse(line.slice(RUNTIME_ERROR_PREFIX.length)) : undefined;
}

describe("runtime errors", () => {
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("ErrorBoundary shows a fallback and logs one machine-readable line", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("error-boundary")).toBeOnTheScreen();
    expect(screen.getByText("S1 runtime throw")).toBeOnTheScreen();
    expect(parseLog(consoleError)).toMatchObject({ message: "S1 runtime throw", fatal: true });
  });

  it("reportRuntimeError includes the first project file location", () => {
    const error = new Error("bad");
    error.stack = [
      "Error: bad",
      "    at useThing (module://node_modules/react-native/index.js:10:2)",
      "    at EntriesScreen (module://src/screens/EntriesScreen.tsx.js:42:7)",
    ].join("\n");
    expect(reportRuntimeError(error, false)).toEqual({
      message: "bad",
      file: "src/screens/EntriesScreen.tsx",
      line: 42,
      column: 7,
      fatal: false,
    });
    expect(parseLog(consoleError)).toMatchObject({
      file: "src/screens/EntriesScreen.tsx",
      line: 42,
    });
  });

  it("locateError handles plain paths and missing stacks", () => {
    expect(locateError("at App (App.tsx:12:3)")).toEqual({ file: "App.tsx", line: 12, column: 3 });
    expect(locateError(undefined)).toEqual({});
  });
});
