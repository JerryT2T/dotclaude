import { test, expect, afterEach } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

const require = createRequire(import.meta.url);
const { recentProjects, parseArgs, configRoot } = require("./recent-projects.js");

const tmps = [];
afterEach(() => { for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rp-"))); tmps.push(d); return d; };

function repo(dir, remote) {
  fs.mkdirSync(dir, { recursive: true });
  const g = (...a) => spawnSync("git", ["-C", dir, ...a], { encoding: "utf8" });
  g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
  g("commit", "-q", "--allow-empty", "-m", "i");
  if (remote) g("remote", "add", "origin", remote);
}
function transcript(root, name, cwd, ageMin) {
  const d = path.join(root, "projects", name);
  fs.mkdirSync(d, { recursive: true });
  const f = path.join(d, "s.jsonl");
  fs.writeFileSync(f, JSON.stringify({ type: "summary" }) + "\n" + JSON.stringify({ cwd }) + "\n");
  const t = new Date(Date.now() - ageMin * 60000);
  fs.utimesSync(f, t, t);
}

test("skips Claude Desktop scratch workspaces", () => {
  const root = tmp(), work = tmp();
  repo(path.join(work, "alpha"));
  const scratch = path.join(work, "scratch", "workspaces", "s1");
  fs.mkdirSync(scratch, { recursive: true });
  transcript(root, "a", path.join(work, "alpha"), 5);
  transcript(root, "s", scratch, 1);
  expect(recentProjects({ root }).map((p) => path.basename(p.path))).toEqual(["alpha"]);
});

test("lists projects with remote slug, newest first, honours --within-min, --match, --remote", () => {
  const root = tmp(), work = tmp();
  repo(path.join(work, "alpha"), "https://github.com/acme/alpha.git");
  repo(path.join(work, "beta"), "git@github.com:acme/beta.git");
  transcript(root, "a", path.join(work, "alpha"), 5);
  transcript(root, "b", path.join(work, "beta"), 300);
  const all = recentProjects({ root });
  expect(all.map((p) => [path.basename(p.path), p.remote])).toEqual([["alpha", "acme/alpha"], ["beta", "acme/beta"]]);
  expect(recentProjects({ root, withinMin: 60 }).map((p) => path.basename(p.path))).toEqual(["alpha"]);
  expect(recentProjects({ root, match: "BET" }).map((p) => path.basename(p.path))).toEqual(["beta"]);
  expect(recentProjects({ root, remote: "acme/alpha" })).toHaveLength(1);
});

test("a worktree cwd is normalised to the main repo root", () => {
  const root = tmp(), work = tmp();
  const main = path.join(work, "main");
  repo(main);
  const wt = path.join(work, "wt");
  spawnSync("git", ["-C", main, "worktree", "add", "-q", "-b", "x", wt], { encoding: "utf8" });
  transcript(root, "w", wt, 1);
  const r = recentProjects({ root });
  expect(r).toHaveLength(1);
  expect(fs.realpathSync(r[0].path)).toBe(fs.realpathSync(main));
});

test("missing config root, vanished cwd and empty dirs give []", () => {
  const root = tmp();
  expect(recentProjects({ root })).toEqual([]);
  transcript(root, "gone", path.join(root, "does-not-exist"), 1);
  fs.mkdirSync(path.join(root, "projects", "empty"));
  expect(recentProjects({ root })).toEqual([]);
});

test("CLAUDE_CONFIG_DIR is honoured; flags parse", () => {
  expect(configRoot({ CLAUDE_CONFIG_DIR: "/x" })).toBe("/x");
  expect(parseArgs(["--within-min", "60", "--match", "a", "--remote", "o/n"])).toEqual({ withinMin: 60, match: "a", remote: "o/n" });
  expect(() => parseArgs(["--within-min", "x"])).toThrow();
});
