import { describe, test, expect } from "vitest";
import { isLocalDone } from "./mode-state.js";

const files = (over = {}) => ({ variant: "ready", state: { mode: "file-only", delivered: "none" }, ...over });

describe("isLocalDone, file-only (#1231)", () => {
  test("finished card with the real value 'none' is done, for ready and ready-files", () => {
    expect(isLocalDone(files())).toBe(true);
    expect(isLocalDone(files({ variant: "ready-files" }))).toBe(true);
  });
  test("optional final tests keep it done", () => {
    expect(isLocalDone(files({ userFinalTest: [{ action: "x", optional: true }] }))).toBe(true);
  });
  test("mandatory step, open point or pending work is not done", () => {
    expect(isLocalDone(files({ userFinalTest: ["x"] }))).toBe(false);
    expect(isLocalDone(files({ open: ["x"] }))).toBe(false);
    expect(isLocalDone(files({ userTest: ["x"] }))).toBe(false);
    expect(isLocalDone(files({ pending: [{ kind: "agent", name: "a" }] }))).toBe(false);
  });
  test("no delivered value or another variant is not done", () => {
    expect(isLocalDone(files({ state: { mode: "file-only" } }))).toBe(false);
    expect(isLocalDone(files({ state: { mode: "file-only", delivered: " " } }))).toBe(false);
    expect(isLocalDone(files({ state: { mode: "file-only", delivered: "failed" } }))).toBe(false);
    expect(isLocalDone(files({ variant: "test" }))).toBe(false);
  });
  test("the no-remote case is unchanged", () => {
    expect(isLocalDone({ variant: "ready", state: { mode: "git-no-remote", delivered: "local-commit-only" } })).toBe(true);
    expect(isLocalDone({ variant: "ready", state: { mode: "git-no-remote", delivered: "none" } })).toBe(false);
    expect(isLocalDone({ variant: "ready-files", state: { mode: "git-no-remote", delivered: "local-commit-only" } })).toBe(false);
  });
});
