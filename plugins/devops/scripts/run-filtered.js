#!/usr/bin/env node
/**
 * @script run-filtered
 * @version 0.1.0
 * @plugin devops
 * @description Runs the command after `--` through the platform shell and
 *   prints only what the model needs: short output unchanged, long output as
 *   failure lines (+3 lines of context) and the runner's last 25 lines, with
 *   the full output in `<tmpdir>/devops-output/<ts>-<rand>.log` (newest 20
 *   kept). The log is written while the command runs, and one line names it
 *   as soon as the output passes the short-output limit, so a run killed by
 *   the tool's timeout still leaves its output findable. Exits with the
 *   command's exit code (signal → 1). Written by
 *   hooks/pre-tool-use/pre.bash.output-filter.js, behind the
 *   `bash-output-filter` feature flag. Appends one JSON line per run to
 *   `~/.claude/devops-output-filter.jsonl` (best effort).
 *
 *   Usage: node run-filtered.js -- <command...>
 */

if (require.main === module && !require('../hooks/lib/features').featureAllowed('bash-output-filter')) {
  process.stderr.write('bash-output-filter: not available on this channel\n');
  process.exit(126);
}

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_LINES = 60;
const MAX_CHARS = 4000;
const CONTEXT = 3;
const MAX_FAILURE_LINES = 120;
const TAIL = 25;
const TAIL_ON_FAIL = 80;
const KEEP_LOGS = 20;

const FAILURE = new RegExp([
  '\\b(?:FAIL|FAILED|FAILURES|ERROR|AssertionError|panic)\\b',
  '\\b(?:Error|TypeError|ReferenceError|SyntaxError):',
  '^\\s*(?:not ok|--- FAIL|E\\s{2,}|[×✗✖❯]\\s)',
  'error TS\\d+',
  'error\\[E\\d+\\]',
  '^\\s*\\d+:\\d+\\s+error\\b',
  '^\\s*\\d+\\)\\s',
  '\\bfailed\\b.*\\btests?\\b|\\btests?\\b.*\\bfailed\\b',
].join('|'));

/** Quote an argument the platform shell would otherwise split or interpret. */
function quoteArg(a) {
  return /[\s"'&|<>^()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a;
}

/**
 * Pure filter. Returns what to print and how many characters it holds.
 * @param {string} text full merged output
 * @param {number} code exit code
 * @param {string} logPath
 */
function filterOutput(text, code, logPath) {
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (lines.length <= MAX_LINES && text.length <= MAX_CHARS) return text;

  const hits = [];
  lines.forEach((l, i) => { if (FAILURE.test(l)) hits.push(i); });
  const pick = new Set();
  if (hits.length) {
    for (const i of hits) {
      for (let j = Math.max(0, i - CONTEXT); j <= Math.min(lines.length - 1, i + CONTEXT); j++) {
        if (pick.size >= MAX_FAILURE_LINES) break;
        pick.add(j);
      }
    }
    for (let j = Math.max(0, lines.length - TAIL); j < lines.length; j++) pick.add(j);
  } else {
    const n = code !== 0 ? TAIL_ON_FAIL : TAIL;
    for (let j = Math.max(0, lines.length - n); j < lines.length; j++) pick.add(j);
  }
  const out = [...pick].sort((a, b) => a - b).map((i) => lines[i]);
  out.push(`[devops] full output: ${lines.length} lines → ${logPath}`);
  return out.join('\n') + '\n';
}

function newLogPath() {
  const dir = path.join(os.tmpdir(), 'devops-output');
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}.log`;
  return { dir, file: path.join(dir, name) };
}

function pruneLogs(dir) {
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.log'))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const { f } of files.slice(KEEP_LOGS)) fs.rmSync(path.join(dir, f), { force: true });
  } catch { /* best effort */ }
}

function recordMetric(entry) {
  try {
    const dir = path.join(os.homedir(), '.claude');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'devops-output-filter.jsonl'), JSON.stringify(entry) + '\n');
  } catch { /* best effort */ }
}

function run(argv) {
  const sep = argv.indexOf('--');
  const parts = sep === -1 ? argv : argv.slice(sep + 1);
  if (!parts.length) {
    process.stderr.write('usage: run-filtered.js -- <command...>\n');
    return process.exit(2);
  }
  const { dir, file } = newLogPath();
  const shownPath = file.replace(/\\/g, '/');
  const chunks = [];
  const { spawn, spawnSync } = require('child_process');
  const opts = { stdio: ['inherit', 'pipe', 'pipe'], env: process.env, windowsHide: true };
  // Windows needs the shell for the .cmd shims (npm, npx, vitest). Elsewhere
  // the arguments go to the program as they are: a second shell would expand
  // `$` and globs the calling shell had already settled.
  const child = process.platform === 'win32'
    ? spawn(parts.map(quoteArg).join(' '), { ...opts, shell: true })
    : spawn(parts[0], parts.slice(1), opts);

  // The log grows with the run, and the first line past the short-output limit
  // names it at once: a run that is killed (tool timeout, interrupt) can print
  // nothing more, and the model still knows where the output is.
  let logOk = true;
  let chars = 0;
  let newlines = 0;
  let announced = false;
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, ''); pruneLogs(dir); } catch { logOk = false; }
  const take = (b) => {
    chunks.push(b);
    if (!logOk) return;
    try { fs.appendFileSync(file, b); } catch { logOk = false; return; }
    chars += b.length;
    for (const c of b) if (c === 10) newlines++;
    if (!announced && (newlines > MAX_LINES || chars > MAX_CHARS)) {
      announced = true;
      process.stdout.write(`[devops] long output, written as it comes to ${shownPath}\n`);
    }
  };
  child.stdout.on('data', take);
  child.stderr.on('data', take);

  const report = (exit) => {
    const text = Buffer.concat(chunks).toString('utf8');
    const shown = logOk ? filterOutput(text, exit, shownPath) : text;
    recordMetric({ ts: new Date().toISOString(), runner: parts[0], exit, totalChars: text.length, printedChars: shown.length });
    return shown;
  };

  const kill = () => {
    // the whole tree: on Windows the child is the shell, the runner its grandchild
    try {
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else child.kill();
    } catch { /* gone */ }
    try { fs.writeSync(1, report(1)); } catch { /* stdout closed */ }
    process.exit(1);
  };
  process.on('SIGTERM', kill);
  process.on('SIGINT', kill);

  child.on('error', (e) => {
    process.stderr.write(`run-filtered: ${e.message}\n`);
    process.exit(1);
  });
  child.on('close', (code) => {
    const exit = typeof code === 'number' ? code : 1;
    process.stdout.write(report(exit), () => process.exit(exit));
  });
}

if (require.main === module) run(process.argv.slice(2));

module.exports = { filterOutput, quoteArg, FAILURE };
