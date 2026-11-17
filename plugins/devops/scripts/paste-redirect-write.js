#!/usr/bin/env node
/**
 * paste-redirect-write — the ONE write path of the deterministic paste /
 * tool-output redirect (#1106 parts 6b + 6c, docs/dev/mods.md). The devops mod
 * runs it with `$.process.run(['node', …])`; the decision and the excerpt come
 * from `hooks/lib/paste-redirect.js`, nothing is ever rewritten by a model.
 *
 * stdin  JSON  { cwd, kind: 'paste'|'output', text, command?, tool? }
 * stdout JSON  { ok: true, redirect: false, reason }
 *           or { ok: true, redirect: true, path, excerpt, tokens }
 *           or { ok: false, reason }
 * exit   0 only with `ok: true`. The mod replaces the text ONLY on
 *        `redirect: true` with a path whose bytes it can trust; every other
 *        answer, a non-zero exit, a timeout or garbage keeps the text whole.
 *
 * Robustness:
 *   1. Decision: `planPaste` (exempt: /do-run, AUTOSTART / RESUME markers,
 *      <command-name>) or `planOutput` (exempt: test, git, gh, CI commands).
 *      An output the token guard released on an identical retry stays whole
 *      (`lib/token-guard-release.js`, one decision path with pre.tokens.guard).
 *   2. The original is written byte-exact (utf8) to
 *      `<cwd>/.claude/redirects/<kind>-<sha1>.txt` via a temp file + rename,
 *      then read back and compared. Any mismatch → `ok: false`, file removed.
 *   3. Same content → same name, so a retried hook overwrites, never piles up.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const R = require('../hooks/lib/paste-redirect');
const { confirmKey, wasReleased } = require('../hooks/lib/token-guard-release');
const { projectClaudeDir } = require('../hooks/lib/project-root');

// Anchored at the project root (hooks/lib/project-root.js): a session in a subdirectory never scatters <subdir>/.claude/.
function redirectDir(cwd) { return path.join(projectClaudeDir(cwd), 'redirects'); }

function decide(req) {
  if (req.kind === 'paste') return R.planPaste(req.text);
  if (req.kind === 'output') {
    const plan = R.planOutput(req.command || '', req.text);
    if (plan.redirect && wasReleased(confirmKey(req.tool || 'Bash', req.cwd, { command: req.command || '' }))) {
      return { redirect: false, reason: 'guard-released', tokens: plan.tokens };
    }
    return plan;
  }
  return null;
}

function writeExact(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
  if (fs.readFileSync(file, 'utf8') !== text) {
    try { fs.unlinkSync(file); } catch { /* gone */ }
    throw new Error('read-back mismatch');
  }
}

function run(req) {
  if (!req || typeof req !== 'object') return { ok: false, reason: 'bad-request' };
  if (typeof req.cwd !== 'string' || !req.cwd || !path.isAbsolute(req.cwd)) return { ok: false, reason: 'bad-cwd' };
  if (typeof req.text !== 'string') return { ok: false, reason: 'bad-text' };
  const plan = decide(req);
  if (!plan) return { ok: false, reason: 'bad-kind' };
  if (!plan.redirect) return { ok: true, redirect: false, reason: plan.reason };
  const file = path.join(redirectDir(req.cwd), R.fileNameFor(req.text, req.kind));
  try {
    writeExact(file, req.text);
  } catch (err) {
    return { ok: false, reason: `write-failed: ${err.message}` };
  }
  const shown = file.split(path.sep).join('/');
  return { ok: true, redirect: true, path: shown, excerpt: R.excerpt(req.text, shown), tokens: plan.tokens };
}

module.exports = { run, redirectDir };

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { input += d; });
  process.stdin.on('end', () => {
    let out;
    // Gated like the mod that calls it (feature `claude-mods`): switched off → refuse, the text stays whole.
    let allowed = false;
    try { allowed = require('../hooks/lib/features').featureAllowed('claude-mods'); } catch { allowed = false; }
    if (!allowed) {
      process.stdout.write(JSON.stringify({ ok: false, reason: 'feature-off' }) + '\n');
      process.exit(126);
    }
    try { out = run(JSON.parse(input)); } catch (err) { out = { ok: false, reason: `bad-json: ${err.message}` }; }
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exit(out.ok ? 0 : 1);
  });
}
