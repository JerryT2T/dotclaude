import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { detect, message, isFinalReport, dateOf } = createRequire(import.meta.url)("./concept-unlanded.js");

let dir;
const REL = "docs/concepts/2026-11-15-posthog-audit.html";
const write = (html, extra = {}) => {
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(dir, "docs", "concepts"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude", "concept-active.json"), JSON.stringify({ html_path: REL, slug: "posthog-audit", ...extra }));
  fs.writeFileSync(path.join(dir, REL), html);
};
const FINAL = "<body><section data-final-report>x</section></body>";
// fake git: blob ids by ref, counts by range
const fakeGit = ({ base = "b1", mine = "b2", upstream = "origin/x", unpushed = "3", merges = "2" } = {}) => (args) => {
  const j = args.join(" ");
  if (j.startsWith("rev-parse --abbrev-ref HEAD")) return "docs/x";
  if (j.startsWith("symbolic-ref")) return "origin/main";
  if (j.includes("origin/main:")) return base;
  if (j.includes("HEAD:docs")) return mine;
  if (j.includes("@{u}")) return upstream;
  if (j.includes("--merges")) return merges;
  if (j.includes("--count")) return unpushed;
  return null;
};

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "concept-unl-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("concept-unlanded", () => {
  test("final report not in main with unpushed merges: reported with counts", () => {
    write(FINAL);
    const info = detect(dir, { git: fakeGit() });
    expect(info).toMatchObject({ slug: "posthog-audit", date: "2026-11-15", unpushed: 3, merges: 2, branch: "docs/x" });
    const de = message(info, "de");
    expect(de).toContain("Concept-Abschluss offen");
    expect(de).toContain("finalize");
    expect(de).toContain("3 ungepushte Commits");
    expect(message(info, "en")).toContain("push or ship");
  });

  test("no unpushed commits: only the finalize ask", () => {
    write(FINAL);
    const m = message(detect(dir, { git: fakeGit({ unpushed: "0", merges: "0" }) }), "de");
    expect(m).toContain("finalize");
    expect(m).not.toContain("ungepusht");
  });

  test("report already in main: silent", () => {
    write(FINAL);
    expect(detect(dir, { git: fakeGit({ base: "same", mine: "same" }) })).toBeNull();
  });

  test("no active concept file (finalized): silent", () => {
    expect(detect(dir, { git: fakeGit() })).toBeNull();
  });

  test("page not at its final report, or paused: silent", () => {
    write("<body><section>round 1</section><script>'data-final-report'</script></body>");
    expect(detect(dir, { git: fakeGit() })).toBeNull();
    write(FINAL, { paused_at: "2026-11-15T00:00:00Z" });
    expect(detect(dir, { git: fakeGit() })).toBeNull();
  });

  test("helpers", () => {
    expect(isFinalReport(FINAL)).toBe(true);
    expect(dateOf(REL)).toBe("2026-11-15");
    expect(message(null)).toBeNull();
  });
});
