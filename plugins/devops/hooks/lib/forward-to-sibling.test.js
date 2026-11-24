import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("out-of-scope findings go to the owning sibling thread", () => {
  test("project-threads.md states the rule", () => {
    const s = read("deep-knowledge/project-threads.md");
    expect(s).toContain("## Findings that belong to another thread");
    expect(s).toMatch(/message_thread/);
    expect(s).toMatch(/message_coordinator/);
    expect(s).toMatch(/weitergegeben/);
    expect(s).toMatch(/never goes to the person as a decision/);
  });
  test("auto-polish Step 10a forwards before it asks", () => {
    const s = read("skills/auto-polish/deep-knowledge/fix-phases.md");
    expect(s).toContain("Step 10a");
    expect(s.indexOf("Step 10a")).toBeLessThan(s.indexOf("When `$AUTONOMOUS=0`"));
    expect(s).toMatch(/never put to the person\s+as a decision/);
    expect(s).toMatch(/>3 concept-page threshold/);
  });
  test("output has a Forwarded line and the skills point at the rule", () => {
    expect(read("skills/auto-polish/deep-knowledge/retest-and-output.md")).toMatch(/Forwarded \(weitergegeben\)/);
    expect(read("skills/auto-polish/SKILL.md")).toMatch(/forwarded, not asked \(Step 10a/);
    expect(read("skills/auto-harden/SKILL.md")).toMatch(/Findings that belong to another thread/);
  });
});
