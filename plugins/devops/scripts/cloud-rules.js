#!/usr/bin/env node
/**
 * @script cloud-rules
 * @version 0.3.0
 * @plugin devops
 * @description The managed `.claude/rules/devops.md` of a repo: the few working
 *   rules a session follows WITHOUT the plugin. Claude Code loads the repo's
 *   root `.claude/rules/` in local sessions and in cloud threads of a Claude
 *   Project (which load no repo skills, hooks or MCP servers), so the file is
 *   the one place that reaches both — nothing migrates when a project or a
 *   cloud thread appears later.
 *
 *     check [repo] [--json]   exit 1 when the file is missing, outdated or carries the block twice
 *     write [repo]            the current block in the file — idempotent; text outside the
 *                             markers is kept, the file is created when absent
 *
 *   Never called on its own for an established repo: a new repo gets it from
 *   ss.project.setup, an established one from its next ship (ship_preflight
 *   adds it to the ship's diff). Pure fs; the repo root comes from
 *   hooks/lib/project-root.js. Switch: devops-config `cloud.rulesFile`.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { findRepoRoot } = require('../hooks/lib/project-root');

const REL_PATH = '.claude/rules/devops.md';
const BLOCK_START = '<!-- >>> devops (managed) >>> -->';
const BLOCK_END = '<!-- <<< devops (managed) <<< -->';
/** The budget of the whole file: a rules file is read on every session start. */
const MAX_LINES = 40;

const BODY = [
  '# Working rules (devops plugin)',
  '',
  'Written by the devops plugin and kept current by it. Your own text goes outside the markers.',
  '',
  '## Branches',
  '- Never work on `main`, `master` or the default branch. Branch off it as `<type>/<topic>`',
  '  (a Claude Project thread: `claude/thread-<slug>`) and reach `main` only through a pull request.',
  '- One task, one branch. Do not switch a checkout other work is using; use a worktree instead.',
  '',
  '## Commits',
  '- `<type>(<scope>): <subject>` with type feat, fix, refactor, perf, test, docs, chore or style.',
  '  Subject: at most 72 characters, imperative, no trailing period. The body says why, not what.',
  '- One commit per finished logical unit; `wip(<scope>): <what>` as a checkpoint. A bug fix is its own commit.',
  '',
  '## Version and changelog',
  '- The version number and CHANGELOG belong to the ship step. A work commit never bumps them.',
  '- A cloud session cannot push tags. The ship hands the tag over as exact commands: pass them on.',
  '',
  '## Result format (when no devops plugin renders the completion card)',
  '- End every task with one plain-text reply: a heading `✨✨✨ <title> ✨✨✨`, then a line that starts',
  '  with a status icon (👉 needs you, 🟩 done, 🟥 failed, 🟦 info), then 3-5 numbered points:',
  '  what works now, what was tested and how, what is open, branch and PR link.',
  '',
  '## Where a thread runs',
  '- Local threads first. A Claude Project thread (a `<wake …><project …>` prompt) that runs in a cloud',
  '  container (environment `CLAUDE_CODE_REMOTE=true`): end the FIRST reply with one line that it runs in',
  '  the cloud, and ask the coordinator in that same turn to start the next threads of this project with',
  '  "Work locally" on a device that has this repo checked out. Do the work anyway. Anywhere else, say nothing.',
  '',
  '## Claude Project thread without the devops plugin',
  '- Only when no skill named `devops:…` is loaded in this session and the prompt is a Claude Project thread',
  '  (a `<wake …><project …>` envelope): end the FIRST reply with one line that the devops plugin is not',
  '  active in this project and is added under Project settings > Plugins. Anywhere else, say nothing.',
];

/** The managed block, LF endings, no trailing newline. */
function renderBlock() {
  return [BLOCK_START, ...BODY, BLOCK_END].join('\n');
}

/**
 * Put the current block into `text` (LF). Absent → appended after the existing
 * content (or the whole file); present → replaced in place; a second copy is dropped.
 * @param {string} text
 * @returns {string}
 */
function applyBlock(text) {
  const block = renderBlock();
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let placed = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== BLOCK_START) { out.push(lines[i]); continue; }
    const end = lines.findIndex((l, j) => j > i && l.trim() === BLOCK_END);
    if (end === -1) { out.push(lines[i]); continue; } // unterminated marker: leave it, append below
    if (!placed) { out.push(block); placed = true; }
    i = end;
  }
  let result = out.join('\n');
  if (!placed) {
    result = result.replace(/\s+$/, '');
    result = result ? `${result}\n\n${block}` : block;
  }
  return result.replace(/\n+$/, '') + '\n';
}

/** @returns {{ok:boolean, issues:string[]}} */
function checkText(text) {
  if (text === null || text === undefined) return { ok: false, issues: ['missing'] };
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const starts = lines.filter((l) => l.trim() === BLOCK_START).length;
  const issues = [];
  if (starts === 0) issues.push('no-block');
  else if (starts > 1) issues.push('duplicate');
  if (starts >= 1 && applyBlock(text) !== String(text).replace(/\r\n/g, '\n').replace(/\n*$/, '\n')) issues.push('outdated');
  return { ok: issues.length === 0, issues };
}

function rulesFile(repo) {
  const root = findRepoRoot(path.resolve(repo || process.cwd()));
  return root ? { root, file: path.join(root, ...REL_PATH.split('/')) } : null;
}

function readOrNull(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

/**
 * @param {string} repo any path inside the work tree
 * @returns {{root:string|null, file:string|null, ok:boolean, issues:string[]}}
 */
function check(repo) {
  const t = rulesFile(repo);
  if (!t) return { root: null, file: null, ok: false, issues: ['no-repo'] };
  return { root: t.root, file: t.file, ...checkText(readOrNull(t.file)) };
}

/**
 * Write the current block. Idempotent: a current file is not touched.
 * @param {string} repo any path inside the work tree
 * @returns {{root:string|null, file:string|null, changed:boolean, created:boolean, rel:string}}
 */
function write(repo) {
  const t = rulesFile(repo);
  if (!t) return { root: null, file: null, changed: false, created: false, rel: REL_PATH };
  const old = readOrNull(t.file);
  const next = applyBlock(old || '');
  const current = old !== null && old.replace(/\r\n/g, '\n') === next;
  if (current) return { root: t.root, file: t.file, changed: false, created: false, rel: REL_PATH };
  fs.mkdirSync(path.dirname(t.file), { recursive: true });
  fs.writeFileSync(t.file, old !== null && old.includes('\r\n') ? next.replace(/\n/g, '\r\n') : next);
  return { root: t.root, file: t.file, changed: true, created: old === null, rel: REL_PATH };
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const json = rest.includes('--json');
  const repo = rest.find((a) => !a.startsWith('--'));
  if (cmd === 'write') {
    const r = write(repo);
    console.log(json ? JSON.stringify(r) : r.root ? `${r.changed ? (r.created ? 'created' : 'updated') : 'current'}: ${r.file}` : 'not inside a git work tree');
    return r.root ? 0 : 1;
  }
  if (cmd === 'check') {
    const r = check(repo);
    console.log(json ? JSON.stringify(r) : r.ok ? `ok: ${r.file}` : `${r.issues.join(', ')}${r.file ? `: ${r.file} — fix: node "${__filename.replace(/\\/g, '/')}" write "${r.root}"` : ''}`);
    return r.ok ? 0 : 1;
  }
  console.error('usage: cloud-rules.js check|write [repo] [--json]');
  return 2;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { REL_PATH, BLOCK_START, BLOCK_END, MAX_LINES, renderBlock, applyBlock, checkText, check, write };
