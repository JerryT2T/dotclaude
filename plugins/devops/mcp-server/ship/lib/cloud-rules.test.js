import { describe, test, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { cloudRulesStep } from "./cloud-rules.js";
import { dirtyState } from "./git.js";

const REL = ".claude/rules/devops.md";
const tmp = [];
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", windowsHide: true }).trim();

/** A repo with one commit on main and a feature branch one commit ahead. */
function repo() {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ship-cr-")));
  tmp.push(d);
  git(d, "init", "-q", "-b", "main");
  git(d, "config", "user.email", "t@t.t");
  git(d, "config", "user.name", "t");
  fs.writeFileSync(path.join(d, "a.txt"), "a\n");
  git(d, "add", "."); git(d, "commit", "-qm", "init");
  git(d, "checkout", "-qb", "feat/x");
  fs.writeFileSync(path.join(d, "b.txt"), "b\n");
  git(d, "add", "."); git(d, "commit", "-qm", "feat: b");
  return d;
}
afterEach(() => { while (tmp.length) fs.rmSync(tmp.pop(), { recursive: true, force: true }); });

describe("ship_preflight cloud rules step", () => {
  test("clean tree, branch ahead: the file is committed on the shipping branch and reported", () => {
    const d = repo();
    const res = cloudRulesStep({ cwd: d, state: dirtyState({ cwd: d }), ahead: 1, blocked: false });
    expect(res).toMatchObject({ name: "cloud-rules", ok: true, file: REL, created: true, committed: true });
    expect(git(d, "show", "--name-only", "--format=%s", "HEAD")).toContain(REL);
    expect(git(d, "status", "--porcelain")).toBe("");
    // the next ship adds nothing: idempotent
    expect(cloudRulesStep({ cwd: d, state: dirtyState({ cwd: d }), ahead: 2, blocked: false })).toBeNull();
  });

  test("tracked edits waiting: the file is written and staged, and joins the work commit's file list", () => {
    const d = repo();
    fs.writeFileSync(path.join(d, "a.txt"), "changed\n");
    const state = dirtyState({ cwd: d });
    const res = cloudRulesStep({ cwd: d, state, ahead: 1, blocked: false });
    expect(res).toMatchObject({ staged: true, committed: false });
    expect(state.modified).toContain(REL);
    expect(git(d, "diff", "--cached", "--name-only")).toBe(REL);
    expect(git(d, "log", "-1", "--format=%s")).toBe("feat: b");
  });

  test("nothing to ship, a blocked ship, untracked files or the switch off: nothing is written", () => {
    const d = repo();
    const state = dirtyState({ cwd: d });
    expect(cloudRulesStep({ cwd: d, state, ahead: 0, blocked: false })).toBeNull();
    expect(cloudRulesStep({ cwd: d, state, ahead: 1, blocked: true })).toBeNull();
    fs.writeFileSync(path.join(d, "new.txt"), "n\n");
    expect(cloudRulesStep({ cwd: d, state: dirtyState({ cwd: d }), ahead: 1, blocked: false })).toBeNull();
    fs.rmSync(path.join(d, "new.txt"));
    fs.mkdirSync(path.join(d, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(d, ".claude", "devops-config.json"), JSON.stringify({ cloud: { rulesFile: false } }));
    git(d, "add", "-f", ".claude/devops-config.json"); git(d, "commit", "-qm", "chore: cfg");
    expect(cloudRulesStep({ cwd: d, state: dirtyState({ cwd: d }), ahead: 2, blocked: false })).toBeNull();
    expect(fs.existsSync(path.join(d, REL))).toBe(false);
  });

  test("a repo that ignores .claude/rules is left alone", () => {
    const d = repo();
    fs.writeFileSync(path.join(d, ".gitignore"), ".claude/\n");
    git(d, "add", ".gitignore"); git(d, "commit", "-qm", "chore: ignore");
    expect(cloudRulesStep({ cwd: d, state: dirtyState({ cwd: d }), ahead: 2, blocked: false })).toBeNull();
    expect(fs.existsSync(path.join(d, REL))).toBe(false);
  });

  test("a folder that is no git repo is never written into", () => {
    const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ship-cr-nogit-")));
    tmp.push(d);
    const res = cloudRulesStep({ cwd: d, state: { dirty: false, modified: [], untracked: [] }, ahead: 1, blocked: false, mode: "none" });
    expect(res).toBeNull();
    expect(fs.existsSync(path.join(d, ".claude"))).toBe(false);
  });
});
