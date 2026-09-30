import { describe, expect, it } from "vitest";
import { err, map, ok, unwrap, type Result } from "./result";

function parsePort(input: string): Result<number, string> {
  const port = Number(input);
  return Number.isInteger(port) && port > 0 ? ok(port) : err(`invalid port: ${input}`);
}

describe("Result", () => {
  it("narrows on ok", () => {
    const result = parsePort("3000");
    expect(result.ok && result.value).toBe(3000);

    const failed = parsePort("abc");
    expect(!failed.ok && failed.error).toBe("invalid port: abc");
  });

  it("maps values and passes errors through", () => {
    expect(map(parsePort("80"), (p) => p + 1)).toEqual(ok(81));
    expect(map(parsePort("x"), (p) => p + 1)).toEqual(err("invalid port: x"));
  });

  it("unwraps values and throws errors", () => {
    expect(unwrap(parsePort("80"))).toBe(80);
    expect(() => unwrap(parsePort("x"))).toThrow("invalid port: x");
    const cause = new TypeError("boom");
    expect(() => unwrap(err(cause))).toThrow(cause);
  });
});
