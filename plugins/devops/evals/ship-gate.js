#!/usr/bin/env node
// Ship gate for the plugin source repo: runs the `learned` eval cases of the
// skills a diff touches, through ab-run.js (plan login, one run each).
//
// Usage: node plugins/devops/evals/ship-gate.js [--base origin/main] [--dry-run]
//   --base <ref>   diff base (default origin/main); changed = `git diff --name-only <ref>...HEAD`
//                  plus uncommitted and untracked changes
//   --dry-run      print the selected cases, run nothing
//   --out <dir>    results root handed to ab-run.js (default: a temp dir)
//
// Exit 0: no learned case applies, or every graded check passed (null =
// undecided never blocks). Exit 1: a check failed twice (the failing case is
// rerun once) - one line per failing case on stderr. Exit 2: usage/git error.

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { EVALS_DIR, listCaseIds, loadCase } = require("./lib/case");

const SKILL_PATH = /^plugins\/devops\/skills\/([^/]+)\//;

function parseArgs(argv) {
  const opts = { base: "origin/main", dryRun: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--base" || a === "--out") {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      opts[a === "--base" ? "base" : "out"] = argv[++i];
    } else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

/** Skill folder names touched by a list of repo-relative paths. */
function changedSkills(files) {
  const out = new Set();
  for (const f of files) {
    const m = String(f).replace(/\\/g, "/").match(SKILL_PATH);
    if (m) out.add(m[1]);
  }
  return [...out].sort();
}

/**
 * Ids of `learned` cases that apply: those under evals/skills/<skill>/ of a
 * touched skill, and any whose `covers:` lists a path prefix of a changed file
 * (a rule that lives in a hook or a shared deep-knowledge doc).
 */
function selectCases(skills, root = EVALS_DIR, files = []) {
  const changed = files.map((f) => String(f).replace(/\\/g, "/"));
  const ids = [];
  for (const id of listCaseIds(root)) {
    const c = loadCase(path.join(root, id));
    if (!c.tags.includes("learned")) continue;
    const m = id.match(/^skills\/([^/]+)\//);
    const bySkill = m && skills.includes(m[1]);
    const byPath = c.covers.some((p) => changed.some((f) => f.startsWith(String(p))));
    if (bySkill || byPath) ids.push(id);
  }
  return ids;
}

/** Failing graders per case from the result JSONs of one ab-run output dir. */
function failuresIn(dir) {
  const failed = new Map();
  const runs = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (e.name.endsWith(".json") && e.name !== "summary.json") runs.push(path.join(d, e.name));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  for (const f of runs) {
    const r = JSON.parse(fs.readFileSync(f, "utf8"));
    for (const [name, grade] of Object.entries(r.grades || {})) {
      if (grade === false) failed.set(r.case, [...(failed.get(r.case) || []), name]);
    }
  }
  return failed;
}

/** Default runner: ab-run.js on plan login, one run per case. */
function runCases(ids, out) {
  const args = [path.join(__dirname, "ab-run.js"), "--runs", "1", "--no-api-credit", "--out", out];
  for (const id of ids) args.push("--case", id);
  const r = spawnSync(process.execPath, args, { stdio: ["ignore", "inherit", "inherit"], windowsHide: true });
  if (r.error) throw r.error;
  return failuresIn(out);
}

function changedFiles(base, cwd) {
  const git = (args) => {
    const r = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(r.stderr || "").trim()}`);
    return r.stdout.split(/\r?\n/).filter(Boolean);
  };
  return [...new Set([...git(["diff", "--name-only", `${base}...HEAD`]), ...git(["diff", "--name-only", "HEAD"]), ...git(["ls-files", "--others", "--exclude-standard"])])];
}

/**
 * @returns {number} exit code
 */
function main(argv, deps = {}) {
  const opts = parseArgs(argv);
  const files = (deps.changedFiles || changedFiles)(opts.base);
  const ids = selectCases(changedSkills(files), deps.root || EVALS_DIR, files);
  if (!ids.length) { console.log("ship-gate: no learned eval case applies to this diff"); return 0; }
  if (opts.dryRun) { console.log(`ship-gate: would run ${ids.length} case(s):\n${ids.map((i) => `  ${i}`).join("\n")}`); return 0; }
  const run = deps.runCases || runCases;
  const out = opts.out || fs.mkdtempSync(path.join(os.tmpdir(), "ship-gate-"));
  let failed = run(ids, path.join(out, "run1"));
  if (failed.size) failed = run([...failed.keys()], path.join(out, "run2"));
  if (!failed.size) { console.log(`ship-gate: ${ids.length} learned eval case(s) passed`); return 0; }
  for (const [id, graders] of failed) console.error(`ship-gate: FAIL ${id} - failed after one rerun: ${graders.join(", ")}`);
  return 1;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (err) { console.error(`[ship-gate] ${err.message}`); process.exitCode = 2; }
}

module.exports = { parseArgs, changedSkills, selectCases, failuresIn, changedFiles, main };
