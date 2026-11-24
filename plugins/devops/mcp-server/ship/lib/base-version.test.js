import { describe, test, expect, vi } from "vitest";
vi.mock("./git.js", () => ({ gitTry: vi.fn() }));
import { gitTry } from "./git.js";
import { baseVersionOf, semverAbove } from "./base-version.js";

describe("baseVersionOf", () => {
  test("reads the version file as the base branch holds it", () => {
    gitTry.mockImplementation((a) => (a[0] === "rev-parse" ? "/r" : a[1] === "origin/main:package.json" ? '{"version":"1.1.0"}' : null));
    expect(baseVersionOf("/r", "main", "package.json")).toBe("1.1.0");
  });
  test("unknown → null", () => {
    gitTry.mockReturnValue(null);
    expect(baseVersionOf("/r", "main", "package.json")).toBeNull();
    expect(baseVersionOf("/r", "main", null)).toBeNull();
  });
  test("semverAbove", () => {
    expect(semverAbove("1.2.0", "1.1.9")).toBe(true);
    expect(semverAbove("1.1.9", "1.1.9")).toBe(false);
    expect(semverAbove("1.0.0", "1.1.0")).toBe(false);
  });
});
