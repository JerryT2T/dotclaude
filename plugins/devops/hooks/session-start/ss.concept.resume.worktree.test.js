import { describe, test, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { findConceptRoot } from "./ss.concept.resume.js";

const HOOK = path.resolve(import.meta.dirname, "ss.concept.resume.js");
const PLUGIN_ROOT = path.resolve(import.meta.dirname, "..", "..");

/** parent/<repo>/.claude/worktrees/<wt>/ holding the state file + html. */
function fixture(layout) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "concept-wt-"));
  const wt = layout === "repo-root"
    ? path.join(parent, ".claude", "worktrees", "concept-x")
    : path.join(parent, "repo", ".claude", "worktrees", "concept-x");
  fs.mkdirSync(path.join(wt, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(wt, "docs", "concepts"), { recursive: true });
  fs.writeFileSync(path.join(wt, "docs", "concepts", "x.html"), "<html></html>");
  fs.writeFileSync(path.join(wt, ".claude", "concept-active.json"), JSON.stringify({
    port: 8756, html_path: "docs/concepts/x.html", slug: "x", server_pid: null, started_at: new Date().toISOString(),
  }));
  return { parent, wt };
}

describe("findConceptRoot — a state file in a linked worktree below the session cwd (#1245)", () => {
  test.each(["repo-root", "parent-folder"])("finds the worktree (%s)", layout => {
    const { parent, wt } = fixture(layout);
    expect(findConceptRoot(parent)).toBe(wt);
  });

  test("the cwd's own state file wins", () => {
    const { parent } = fixture("parent-folder");
    fs.mkdirSync(path.join(parent, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(parent, ".claude", "concept-active.json"), "{}");
    expect(findConceptRoot(parent)).toBe(parent);
  });

  test("no state anywhere → the cwd", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "concept-wt-empty-"));
    expect(findConceptRoot(empty)).toBe(empty);
  });

  test("the hook run from the parent folder names the worktree state file", () => {
    const { parent, wt } = fixture("parent-folder");
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "concept-home-"));
    fs.mkdirSync(path.join(home, ".claude"));
    fs.writeFileSync(path.join(home, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "devops@dotclaude": true } }));
    const r = spawnSync(process.execPath, [HOOK], {
      cwd: parent,
      input: JSON.stringify({ session_id: `vitest-wt-${process.pid}-${Date.now()}`, source: "startup" }),
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, HOME: home, USERPROFILE: home },
      encoding: "utf8", timeout: 20_000,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(path.join(wt, ".claude", "concept-active.json"));
  });
});
