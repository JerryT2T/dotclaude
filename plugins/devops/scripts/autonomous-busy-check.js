#!/usr/bin/env node
'use strict';
/**
 * autonomous-busy-check — is a long-running user job still going before the
 * autonomous run powers the PC off?
 *
 * Sources of "busy":
 *   1. Processes whose name or command line contains one of the patterns in
 *      devops config `shutdown.busyProcesses` (case-insensitive substring).
 *   2. Lock files `%LOCALAPPDATA%\dotclaude\busy\*.lock` whose content is the
 *      PID of a LIVE process (a dead PID = stale lock, ignored).
 *
 * CLI:
 *   check                          JSON {busy:[{why,name}]}; exit 0 free, 3 busy
 *   wait [--interval-min 10] [--cap-min 360]
 *                                  poll until free or capped; same JSON/exit codes
 * Any other failure exits 1 with {error}; callers treat that as "not busy".
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const EXIT_BUSY = 3;

/**
 * @param {{procs?:Array<{pid:number,name?:string,cmd?:string}>, patterns?:string[],
 *   lockFiles?:Array<{file:string,pid:number}>, isAlive?:(pid:number)=>boolean,
 *   selfPids?:number[]}} input
 * @returns {Array<{why:'process'|'lock',name:string}>}
 */
function findBusy({ procs = [], patterns = [], lockFiles = [], isAlive = () => false, selfPids = [] } = {}) {
  const busy = [];
  const self = new Set(selfPids);
  const pats = patterns.map((p) => String(p).trim().toLowerCase()).filter(Boolean);
  if (pats.length) {
    for (const p of procs) {
      if (self.has(p.pid)) continue;
      const hay = `${p.name || ''}\n${p.cmd || ''}`.toLowerCase();
      const hit = pats.find((x) => hay.includes(x));
      if (hit) busy.push({ why: 'process', name: p.name || hit });
    }
  }
  for (const l of lockFiles) {
    if (!Number.isInteger(l.pid) || l.pid <= 0 || self.has(l.pid)) continue;
    if (isAlive(l.pid)) busy.push({ why: 'lock', name: path.basename(l.file, '.lock') });
  }
  return busy;
}

function lockDir(env = process.env) {
  const base = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'dotclaude', 'busy');
}

function readLockFiles(dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const n of names) {
    if (!n.toLowerCase().endsWith('.lock')) continue;
    const file = path.join(dir, n);
    try { out.push({ file, pid: parseInt(fs.readFileSync(file, 'utf8').trim(), 10) }); } catch { /* unreadable */ }
  }
  return out;
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function listProcs() {
  if (process.platform !== 'win32') return [];
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress'],
  { encoding: 'utf8', timeout: 30000, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout.trim()) return [];
  try {
    const j = JSON.parse(r.stdout);
    return (Array.isArray(j) ? j : [j]).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, name: p.Name, cmd: p.CommandLine || '' }));
  } catch { return []; }
}

function loadPatterns(cwd) {
  const cfg = require('../hooks/lib/devops-config.js');
  const v = cfg.load(cwd).values;
  return (v.shutdown && v.shutdown.busyProcesses) || [];
}

/** One snapshot. deps: listProcs, patterns, lockFiles, isAlive, selfPids. */
function check(deps = {}) {
  const patterns = deps.patterns || loadPatterns(process.cwd());
  const procs = (deps.listProcs || listProcs)();
  const selfPids = (deps.selfPids || [process.pid, process.ppid]).slice();
  // Ancestors of this process (the shell that launched us) are never "busy".
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  for (let cur = byPid.get(process.ppid), n = 0; cur && cur.ppid && n < 8; n++, cur = byPid.get(cur.ppid)) selfPids.push(cur.ppid);
  // Our own descendants (the powershell.exe that listed the processes, its conhost)
  // neither — only below process.pid: an ancestor's other children are real jobs.
  const own = [process.pid];
  for (let added = true, n = 0; added && n < 4; n++) {
    added = false;
    for (const p of procs) if (!own.includes(p.pid) && own.includes(p.ppid)) { own.push(p.pid); added = true; }
  }
  for (const pid of own) if (!selfPids.includes(pid)) selfPids.push(pid);
  return findBusy({
    procs, patterns, selfPids,
    lockFiles: deps.lockFiles || readLockFiles(lockDir()),
    isAlive: deps.isAlive || isAlive,
  });
}

/** Poll until free or capped. deps: sleep(ms), now(), plus check deps. */
async function waitUntilFree({ intervalMin = 10, capMin = 360 } = {}, deps = {}) {
  const now = deps.now || Date.now;
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const deadline = now() + capMin * 60000;
  let busy = check(deps);
  while (busy.length && now() < deadline) {
    await sleep(intervalMin * 60000);
    busy = check(deps);
  }
  return { busy, capped: busy.length > 0 };
}

function argNum(argv, flag, def) {
  const i = argv.indexOf(flag);
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : def;
}

async function main(argv) {
  const cmd = argv[0];
  try {
    let res;
    if (cmd === 'check') res = { busy: check() };
    else if (cmd === 'wait') res = await waitUntilFree({ intervalMin: argNum(argv, '--interval-min', 10), capMin: argNum(argv, '--cap-min', 360) });
    else { process.stderr.write('usage: autonomous-busy-check.js check | wait [--interval-min N] [--cap-min N]\n'); return 1; }
    process.stdout.write(`${JSON.stringify(res)}\n`);
    return res.busy.length ? EXIT_BUSY : 0;
  } catch (e) {
    process.stdout.write(`${JSON.stringify({ error: String((e && e.message) || e) })}\n`);
    return 1;
  }
}

if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c));

module.exports = { findBusy, check, waitUntilFree, readLockFiles, lockDir, EXIT_BUSY };
