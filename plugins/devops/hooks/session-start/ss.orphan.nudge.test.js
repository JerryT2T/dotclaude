import { describe, test, expect } from "vitest";
import { buildNudge } from "./ss.orphan.nudge.js";

const NOW = Date.parse("2026-10-19T12:00:00Z");
const report = (repos, generatedAt = "2026-10-19T06:00:00Z") => ({ generatedAt, repos });
const risk = (dirty = 0) => ({ kind: "branch", branch: "x", dirty });

describe("ss.orphan.nudge", () => {
  const repos = [{ path: "C:/r/app", atRisk: [risk(), risk(), risk(0), { kind: "worktree", dirty: 2 }, { kind: "worktree", dirty: 1 }] }];

  test("German line with both counts for the current repo", () => {
    expect(buildNudge({ cwd: "C:/r/app", report: report(repos), now: NOW }))
      .toBe("⚠ Hier: 3 Branches nicht in main gemergt / 2 Worktrees mit uncommitteter Arbeit (Stand vor 6 h) → „Branches aufräumen“");
  });

  test("English line, worktree below the main checkout matches by prefix", () => {
    expect(buildNudge({ cwd: "C:\\r\\app\\.claude\\worktrees\\x", lang: "en", report: report(repos), now: NOW }))
      .toBe('⚠ Here: 3 branches not merged into main / 2 worktrees with uncommitted work (as of 6 h ago) → "branch cleanup"');
  });

  test("names the report age; minutes below one hour", () => {
    expect(buildNudge({ cwd: "C:/r/app", report: report(repos, "2026-10-19T11:15:00Z"), now: NOW })).toContain("(Stand vor 45 min)");
    expect(buildNudge({ cwd: "C:/r/app", lang: "en", report: report(repos, "2026-10-19T09:00:00Z"), now: NOW })).toContain("(as of 3 h ago)");
  });

  test("silent once the report is older than 24 h", () => {
    expect(buildNudge({ cwd: "C:/r/app", report: report(repos, "2026-10-18T13:00:00Z"), now: NOW })).not.toBeNull();
    expect(buildNudge({ cwd: "C:/r/app", report: report(repos, "2026-10-18T11:00:00Z"), now: NOW })).toBeNull();
    expect(buildNudge({ cwd: "C:/r/app", report: report(repos, "2026-10-17T12:00:00Z"), now: NOW })).toBeNull();
  });

  test("silent: nothing at risk anywhere, stale or missing report; an unknown repo only names the machine total", () => {
    expect(buildNudge({ cwd: "C:/r/other", report: report(repos), now: NOW })).toMatch(/^ℹ Rechner: 5 offen in 1 Repo/);
    expect(buildNudge({ cwd: "C:/r/app", report: report([{ path: "C:/r/app", atRisk: [] }]), now: NOW })).toBeNull();
    expect(buildNudge({ cwd: "C:/r/app", report: report(repos, "2026-10-01T00:00:00Z"), now: NOW })).toBeNull();
    expect(buildNudge({ cwd: "C:/r/app", report: null, now: NOW })).toBeNull();
  });

  test("a prefix that is only a name prefix does not match (app vs app2)", () => {
    expect(buildNudge({ cwd: "C:/r/app2", report: report(repos), now: NOW })).toMatch(/^ℹ Rechner:/);
  });

  describe("safety copies without a decision", () => {
    const parked = (branch, ageDays, extra = {}) => ({ branch, ageDays, legacy: false, ...extra });
    const app = {
      path: "C:/r/app", atRisk: [],
      parked: [
        parked("parked/autosave/old", 5), parked("origin/rescue/a", 9, { legacy: true }),
        parked("parked/autosave/fresh", 1), parked("parked/idea", 10),
      ],
    };

    test("only undecided copies of 3+ days count, and alone they are an info", () => {
      expect(buildNudge({ cwd: "C:/r/app", report: report([app]), now: NOW }))
        .toBe("ℹ Hier: 2 Sicherungskopien ohne Entscheidung (Stand vor 6 h) → „Branches aufräumen“");
      expect(buildNudge({ cwd: "C:/r/app", lang: "en", report: report([app]), now: NOW }))
        .toBe('ℹ Here: 2 safety copies without a decision (as of 6 h ago) → "branch cleanup"');
    });

    test("joins the at-risk counts and adds the machine-wide total when other repos have work", () => {
      const both = { ...app, atRisk: [risk(), { kind: "worktree", dirty: 1 }] };
      const other = { path: "C:/r/other", atRisk: [risk(), risk()], parked: [parked("salvage/z", 40, { legacy: true })] };
      const quiet = { path: "C:/r/quiet", atRisk: [], parked: [] };
      expect(buildNudge({ cwd: "C:/r/app", report: report([both, other, quiet]), now: NOW }))
        .toBe("⚠ Hier: 1 Branch nicht in main gemergt / 1 Worktree mit uncommitteter Arbeit / 2 Sicherungskopien ohne Entscheidung · Rechner: 7 offen in 2 Repos (Stand vor 6 h) → „Branches aufräumen“");
    });

    test("nothing open here: names the machine-wide total — also for a repo the scan does not know", () => {
      const clean = { path: "C:/r/app", atRisk: [], parked: [parked("parked/autosave/fresh", 0)] };
      const other = { path: "C:/r/other", atRisk: [risk()] };
      expect(buildNudge({ cwd: "C:/r/app", report: report([clean, other]), now: NOW }))
        .toBe("ℹ Hier nichts offen · Rechner: 1 offen in 1 Repo (Stand vor 6 h) → „Branches aufräumen“");
      expect(buildNudge({ cwd: "C:/r/new", lang: "en", report: report([clean, other]), now: NOW }))
        .toBe('ℹ whole machine: 1 open in 1 repo (as of 6 h ago) → "branch cleanup"');
      expect(buildNudge({ cwd: "C:/r/app", report: report([clean]), now: NOW })).toBeNull();
    });
  });

  describe("main checkout on a landed branch / landed worktrees outside .claude/worktrees", () => {
    const entry = (extra) => ({ path: "C:/r/app", atRisk: [], ...extra });
    test("one info line naming the branch, in both languages", () => {
      expect(buildNudge({ cwd: "C:/r/app", report: report([entry({ mainOnLanded: "feat/linux" })]), now: NOW }))
        .toBe("ℹ Haupt-Checkout steht auf gemergtem Branch feat/linux → „auf main wechseln“");
      expect(buildNudge({ cwd: "C:/r/app", lang: "en", report: report([entry({ mainOnLanded: "feat/linux" })]), now: NOW }))
        .toBe('ℹ main checkout sits on merged branch feat/linux → "switch to main"');
    });
    test("count of merged outside worktrees ends in the prompt; with the branch hint each gets its own line", () => {
      expect(buildNudge({ cwd: "C:/r/app", lang: "en", report: report([entry({ landedOutside: 3 })]), now: NOW }))
        .toBe('ℹ 3 merged worktrees outside .claude/worktrees → "branch cleanup"');
      const both = buildNudge({ cwd: "C:/r/app", lang: "en", report: report([entry({ landedOutside: 1, mainOnLanded: "x" })]), now: NOW });
      expect(both).toBe('ℹ main checkout sits on merged branch x → "switch to main"\nℹ 1 merged worktree outside .claude/worktrees → "branch cleanup"');
    });
    test("appended on its own line below the risk line; silent without the fields or for another repo", () => {
      const withRisk = buildNudge({ cwd: "C:/r/app", lang: "en", report: report([{ path: "C:/r/app", atRisk: [risk()], landedOutside: 2 }]), now: NOW });
      expect(withRisk.split("\n")).toHaveLength(2);
      expect(buildNudge({ cwd: "C:/r/app", report: report([entry({})]), now: NOW })).toBeNull();
      expect(buildNudge({ cwd: "C:/r/other", report: report([entry({ mainOnLanded: "x" })]), now: NOW })).toBeNull();
    });
  });
});
