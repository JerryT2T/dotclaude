#!/usr/bin/env node
// Lists projects Claude Code has worked in recently, from Claude Code's own
// records (<config>/projects/<encoded-cwd>/*.jsonl). Read-only; only the
// newest transcript of each project dir is touched, and only its head.
//
// Usage: node recent-projects.js [--within-min N] [--match <name>] [--remote <owner/name>]
// Output: JSON [{ path, remote, lastActivityMs }], newest first. A worktree
// cwd is normalised to the main repo root. Config root: CLAUDE_CONFIG_DIR or ~/.claude.

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const HEAD_BYTES = 64 * 1024;

/** Claude Desktop's throwaway session folders are no projects. */
const SCRATCH_WORKSPACE = /[\\/]scratch[\\/]workspaces[\\/]/i;

function configRoot(env = process.env) {
  return env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
}

/** First `cwd` found in the head of a transcript, or null. */
function cwdFromHead(file) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
    for (const line of buf.toString("utf8", 0, n).split(/\r?\n/)) {
      if (!line.includes('"cwd"')) continue;
      try { const o = JSON.parse(line); if (o && typeof o.cwd === "string" && o.cwd) return o.cwd; } catch { /* partial last line */ }
    }
  } catch { /* unreadable */ } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ } }
  return null;
}

function git(cwd, args) {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true, timeout: 5000 });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** Main repo root of a (worktree) cwd; the cwd itself when it is no repo. */
function mainRoot(cwd) {
  const common = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!common) return cwd;
  return path.basename(common) === ".git" ? path.dirname(common) : cwd;
}

/** `owner/name` of origin when it is a GitHub remote, else null. */
function remoteSlug(root) {
  const url = git(root, ["remote", "get-url", "origin"]);
  const m = url && url.match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * @param {{ root?: string, withinMin?: number, match?: string, remote?: string, now?: number }} o
 * @returns {Array<{ path: string, remote: string|null, lastActivityMs: number }>}
 */
function recentProjects(o = {}) {
  const projects = path.join(o.root || configRoot(), "projects");
  const now = o.now || Date.now();
  const byPath = new Map();
  let dirs = [];
  try { dirs = fs.readdirSync(projects, { withFileTypes: true }).filter((e) => e.isDirectory()); } catch { return []; }
  for (const d of dirs) {
    const dir = path.join(projects, d.name);
    let newest = null;
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith(".jsonl")) continue;
        const mtime = fs.statSync(path.join(dir, f)).mtimeMs;
        if (!newest || mtime > newest.mtime) newest = { file: path.join(dir, f), mtime };
      }
    } catch { continue; }
    if (!newest) continue;
    if (o.withinMin != null && now - newest.mtime > o.withinMin * 60000) continue;
    const cwd = cwdFromHead(newest.file);
    if (!cwd || !fs.existsSync(cwd) || SCRATCH_WORKSPACE.test(cwd)) continue;
    const root = mainRoot(cwd);
    const prev = byPath.get(root);
    if (!prev || newest.mtime > prev.lastActivityMs) byPath.set(root, { path: root, remote: null, lastActivityMs: Math.round(newest.mtime) });
  }
  let out = [...byPath.values()];
  if (o.match) { const m = o.match.toLowerCase(); out = out.filter((p) => path.basename(p.path).toLowerCase().includes(m)); }
  for (const p of out) p.remote = remoteSlug(p.path);
  if (o.remote) { const r = o.remote.toLowerCase(); out = out.filter((p) => p.remote && p.remote.toLowerCase() === r); }
  return out.sort((a, b) => b.lastActivityMs - a.lastActivityMs);
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === "--within-min") { o.withinMin = Number(next()); if (!(o.withinMin >= 0)) throw new Error("--within-min must be a number"); }
    else if (a === "--match") o.match = next();
    else if (a === "--remote") o.remote = next();
    else throw new Error(`unknown argument: ${a}`);
  }
  return o;
}

if (require.main === module) {
  try { console.log(JSON.stringify(recentProjects(parseArgs(process.argv.slice(2))))); }
  catch (err) { console.error(`[recent-projects] ${err.message}`); process.exitCode = 2; }
}

module.exports = { configRoot, cwdFromHead, mainRoot, recentProjects, parseArgs };
