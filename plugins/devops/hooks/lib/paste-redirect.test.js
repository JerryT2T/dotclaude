import { describe, test, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const R = require("./paste-redirect.js");

const big = (lines, width = 60) => Array.from({ length: lines }, (_, i) => `line ${i} ${"x".repeat(width)}`).join("\n");

describe("estimateTokens", () => {
  test("~4 chars per token, empty is 0", () => {
    expect(R.estimateTokens("")).toBe(0);
    expect(R.estimateTokens(undefined)).toBe(0);
    expect(R.estimateTokens("abcd")).toBe(1);
    expect(R.estimateTokens("abcde")).toBe(2);
  });
});

describe("planPaste (#1106)", () => {
  test("a paste under 8k tokens stays, one from 8k on is redirected", () => {
    expect(R.planPaste("x".repeat(31996))).toMatchObject({ redirect: false, reason: "small" });
    expect(R.planPaste("x".repeat(32000))).toMatchObject({ redirect: true, reason: "large-paste", tokens: 8000 });
  });
  test("/do-run, autostart / resume markers and slash commands are never redirected", () => {
    const pad = "\n" + "y".repeat(40000);
    for (const p of [
      "/do-run backlog" + pad,
      "  /devops:do-run autonomous" + pad,
      "RUN_BACKLOG_AUTOSTART: presence timeout." + pad,
      "AUTONOMOUS_AUTOSTART: go" + pad,
      "AUTONOMOUS_RESUME: weiter" + pad,
      "BURN_RESUME: x" + pad,
      "<command-name>/do-ship</command-name>" + pad,
    ]) expect([p.slice(0, 30), R.planPaste(p).reason]).toEqual([p.slice(0, 30), "exempt-prompt"]);
  });
  test("a custom threshold is honoured", () => {
    expect(R.planPaste("x".repeat(400), { thresholdTokens: 100 }).redirect).toBe(true);
  });
});

describe("planOutput (#1106)", () => {
  const out = "z".repeat(40000);
  test("large output of an ordinary command is redirected", () => {
    expect(R.planOutput("cat build.log", out)).toMatchObject({ redirect: true, reason: "large-output" });
    expect(R.planOutput("", out).redirect).toBe(true);
  });
  test("test, git and CI commands keep their full output", () => {
    for (const c of ["npm test", "npx vitest run x", "cd app && npm run test", "pytest -q", "python -m pytest",
      "dotnet test", "go test ./...", "cargo test", "git diff origin/main...HEAD", "gh pr checks 12", "gh run view 9 --log",
      "npm run lint", "pnpm run ci", "npx playwright test", "CI=1 npm test", "cd app; dotnet test", "ls && git log -5"]) {
      expect([c, R.planOutput(c, out).reason]).toEqual([c, "exempt-command"]);
    }
  });
  test("look-alikes are not exempt", () => {
    for (const c of ["cat digit.log", "node react-build.js", "echo contest", "type latest.txt", "echo \"npm test\"", "node gen.js --label vitest", "cat git-notes.txt"]) {
      expect([c, R.planOutput(c, out).redirect]).toEqual([c, true]);
    }
  });
  test("small output stays", () => {
    expect(R.planOutput("cat a", "short")).toMatchObject({ redirect: false, reason: "small" });
  });
});

describe("excerpt", () => {
  test("head + marker with path + tail, deterministic", () => {
    const text = big(500);
    const e = R.excerpt(text, "C:/tmp/paste-abc.txt");
    const lines = e.split("\n");
    expect(lines[0]).toBe(text.split("\n")[0]);
    expect(lines[R.HEAD_LINES]).toMatch(/^\[… 420 lines \(~\d+ of ~\d+ tokens\) omitted here — full original: C:\/tmp\/paste-abc\.txt …\]$/);
    expect(lines[lines.length - 1]).toBe(text.split("\n")[499]);
    expect(R.excerpt(text, "C:/tmp/paste-abc.txt")).toBe(e);
    expect(R.estimateTokens(e)).toBeLessThan(R.estimateTokens(text) / 4);
  });
  test("text that fits head + tail is returned unchanged", () => {
    const small = big(10);
    expect(R.excerpt(small, "p")).toBe(small);
  });
  test("one giant line is clamped on both halves", () => {
    const one = "q".repeat(100000);
    const e = R.excerpt(one, "p", { halfMaxChars: 1000 });
    expect(e.length).toBeLessThan(2200 + 200);
    expect(e).toContain("full original: p");
    // #1106 Codex: 0 lines omitted, but ~24k tokens of the one line are — the marker says so.
    expect(e).toMatch(/\[… 0 lines \(~\d+ of ~25000 tokens\)/);
    expect(Number(e.match(/\(~(\d+) of/)[1])).toBeGreaterThan(24000);
  });
  test("CRLF input is split like LF", () => {
    const crlf = big(200).replace(/\n/g, "\r\n");
    expect(R.excerpt(crlf, "p")).toContain("[… 120 lines");
  });
});

describe("fileNameFor", () => {
  test("same content → same name, kind prefix, different content → different name", () => {
    expect(R.fileNameFor("abc")).toBe(R.fileNameFor("abc"));
    expect(R.fileNameFor("abc")).toMatch(/^paste-[0-9a-f]{12}\.txt$/);
    expect(R.fileNameFor("abc", "output")).toMatch(/^output-/);
    expect(R.fileNameFor("abc")).not.toBe(R.fileNameFor("abd"));
  });
});
