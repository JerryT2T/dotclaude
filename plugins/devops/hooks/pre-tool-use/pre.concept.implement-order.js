#!/usr/bin/env node
/**
 * @hook pre.concept.implement-order
 * @version 0.1.0
 * @event PreToolUse
 * @plugin devops
 * @matcher AskUserQuestion|mcp__.*__request_decision
 * @description An implement click on a concept page is the person's go (#1240).
 *   While an implement order is open (recorded by `concept-artifact.js digest`
 *   in `.claude/concepts/<slug>/artifact.json`) and the build has not started,
 *   a decision card or question is held back: exit 2 with the order to build.
 *
 *   Why a hook: the rule as text lost three times. In the skill files, in the
 *   always-on policy and in the digest's own output a session still weighed an
 *   older "concept only" brief plus an overlapping thread above the click and
 *   asked again (eval `skills/auto-concept/implement-click-starts-build`).
 *
 *   The block lifts by itself: once files outside `.claude/` and
 *   `docs/concepts/` changed or HEAD moved (the build runs; a confirmation
 *   that comes up in it passes), once `mark` / `close` removed the order, or
 *   24 h after the click. Where git cannot say whether the build started, the
 *   order holds back exactly one question. A thread message is never blocked,
 *   so a session with a real obstacle can still say so.
 */

require('../lib/plugin-guard');

const fs = require('fs');

const TOOL_RE = /^(?:AskUserQuestion|mcp__.+__request_decision)$/;

function denyText(o) {
  const who = o.order.by ? `, clicked by ${o.order.by}` : '';
  const round = o.order.round ? `, round ${o.order.round}` : '';
  return (
    `[concept-implement] BLOCKED: an implement order is open (concept ${o.slug}${round}${who}) and the build has not ` +
    'started. The click is the person\'s approval for the whole approved scope. It is newer than, and overrides, any ' +
    'earlier "concept only" brief or coordinator note; an overlap with another concept or thread is handled in the ' +
    'build (own branch, the overlapping part easy to swap, named in the PR and the final report), never asked. ' +
    'Do not ask whether, where or how to implement, also not as a question in a thread message. Start the build now ' +
    '(auto-concept Step 5b: reality check, then auto-agents). This block lifts once the build changed files or the ' +
    'order is marked processed (concept-artifact.js mark); a decision that comes up DURING the build goes onto the ' +
    'concept page as its next round (Step 5c).'
  );
}

/** Remember that this order held back its one question (the no-git fallback). Best effort. */
function noteDenied(o) {
  try {
    const rec = JSON.parse(fs.readFileSync(o.file, 'utf8'));
    if (!rec.implement_order || rec.implement_order.id !== o.order.id) return;
    rec.implement_order.denied_at = new Date().toISOString();
    const tmp = `${o.file}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rec, null, 2));
    fs.renameSync(tmp, o.file);
  } catch { /* the next question is held back again: still safe */ }
}

function main(hook, deps = {}) {
  if (!TOOL_RE.test(String(hook.tool_name || ''))) return null;
  const lib = require('../lib/implement-order');
  const root = lib.conceptsRoot(hook.cwd || process.cwd());
  if (!root) return null; // the common case: no concept store, no git, no read beyond a few stats
  const now = deps.now || Date.now();
  for (const o of lib.openOrders(root, now)) {
    const started = lib.buildStarted(o.order, root, deps.treeState);
    if (started === true) continue;
    if (started === null) {
      if (o.order.denied_at) continue;
      (deps.noteDenied || noteDenied)(o);
    }
    return { block: denyText(o) };
  }
  return null;
}

if (require.main === module) {
  try {
    require('../lib/hook-input').runHook(main, { event: 'PreToolUse' });
  } catch {
    // fail open
  }
}

module.exports = { main, denyText };
