#!/usr/bin/env node
/**
 * @hook post.concept.title
 * @version 0.2.0
 * @event PostToolUse
 * @plugin devops
 * @matcher ^(?!(?:Read|Glob|Grep)$|mcp__ccd_)
 * @description Takes the concept's "your move" title back the moment a
 *   submission lands (#930). `👉 ➜ 🧭 Concept ┃` means "your move — look at
 *   the page"; once the user has submitted, it is no longer true. Before this
 *   hook only the turn that processed the wake (auto-concept Step 5 § Mark the
 *   round as work) flipped it, so a session busy with another task, or one
 *   between waker polls, kept saying "waiting for you" after the user had
 *   already sent their decisions.
 *
 *   The signal is the bridge's durable store, read from disk — no HTTP probe:
 *   `.claude/concept-active.json` names the concept, its store
 *   (`.claude/concepts/<html basename>/state.json`) holds the live payload.
 *   A payload with `submitted: true` is a submission Claude is on: `/reset` replaces
 *   the live payload with `submitted: false`, so that alone says the round is open.
 *   `picked_up_at` may already be set by the waker (#956) and `processed_at` is the
 *   LAST reset, which a new submission does not clear, so neither says anything. Each
 *   submission `version` is announced once (`<store>/.title-notified`), and
 *   only when the transcript shows the title still on the waiting prefix.
 *
 *   Only Claude can rename a session, so the flip rides on Claude's next tool
 *   call: an idle session still relies on the pickup waker. The `👉` prefix
 *   itself comes back only with the card after `/reset` of the next round.
 *   Cost on a tool call without an open concept: one failed stat.
 *
 *   The concept need not live in the session's cwd (#1090): a session can run
 *   a concept page in another checkout (`--state "<other root>/.claude/
 *   concept-active.json"`). The hook remembers the state path from the
 *   session's own concept-watch / concept-tick launch command (a per-session
 *   pointer in the temp dir) and falls back to it when the cwd has no active
 *   concept — before, the flip never fired there and the title kept `👉`
 *   through a whole finalize implement.
 */

require('../lib/plugin-guard');

const fs = require('fs');
const path = require('path');
const { runHook } = require('../lib/hook-input');
const { sessionFile, writeSessionFile } = require('../lib/session-id');
const { readCurrentTitle, stripPrefixes, CONCEPT_PREFIX, CONCEPT_WORKING_PREFIX } = require('../lib/session-title');

const TAG = '[post.concept.title]';
const NOTIFIED = '.title-notified';
const POINTER = 'dotclaude-devops-concept-state';
// The waker / pulser / tick launch: `concept-watch.js … --state "<path>"`.
const STATE_ARG = /concept-(?:watch|tick)\.js\b[^\n]*?--state\s+(?:"([^"]+)"|'([^']+)'|(\S+))/;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/**
 * The concept store of the active concept, or null.
 *
 * @param {string} cwd
 * @returns {string|null}
 */
function activeStore(cwd) {
  const active = readJson(path.join(cwd, '.claude', 'concept-active.json'));
  if (!active || typeof active.html_path !== 'string' || !active.html_path) return null;
  const base = path.basename(active.html_path).replace(/\.html$/i, '');
  if (!base) return null;
  return path.join(cwd, '.claude', 'concepts', base);
}

/**
 * The concept state path (`<root>/.claude/concept-active.json`) a Bash
 * command launches a concept watcher for, or null.
 *
 * @param {object} hook PostToolUse payload
 * @returns {string|null}
 */
function launchedStatePath(hook) {
  if (!hook || (hook.tool_name !== 'Bash' && hook.tool_name !== 'PowerShell')) return null;
  if (!hook.tool_input || typeof hook.tool_input.command !== 'string') return null;
  const m = STATE_ARG.exec(hook.tool_input.command);
  const p = m && (m[1] || m[2] || m[3]);
  return p && /concept-active\.json$/i.test(p) ? p : null;
}

/**
 * The project root of the concept this session runs outside its cwd, from
 * the pointer its launch command left, or null.
 *
 * @param {string} pointer pointer file
 * @returns {string|null}
 */
function pointedRoot(pointer) {
  let state;
  try { state = fs.readFileSync(pointer, 'utf8').trim(); } catch { return null; }
  if (!state) return null;
  return path.dirname(path.dirname(state));
}

/**
 * The submission version waiting for Claude, or null.
 *
 * @param {object|null} state the store's state.json
 * @returns {number|null}
 */
function waitingVersion(state) {
  if (!state || typeof state !== 'object') return null;
  // Not gated on picked_up_at: the pickup waker's /pending=true poll stamps it
  // before the model's first tool call, so that gate never let the waker path
  // through (#956). Not gated on processed_at either: it holds the last /reset and
  // stays set through the next submission, so that gate silenced every round after
  // the first. /reset clears the payload; the per-version marker is the once-guard.
  let payload = null;
  try { payload = JSON.parse(state.decisions); } catch { return null; }
  if (!payload || payload.submitted !== true) return null;
  return Number.isInteger(state.version) ? state.version : null;
}

/**
 * The reply for a PostToolUse payload.
 *
 * @param {object} hook
 * @param {{ cwd?: string, readTitle?: (p: string|undefined) => string|null }} [deps] test seam
 * @returns {{context: string}|null}
 */
function main(hook, deps = {}) {
  if (hook && typeof hook.tool_name === 'string' && hook.tool_name.startsWith('mcp__ccd_')) return null;
  const cwd = deps.cwd || (hook && hook.cwd) || process.cwd();
  const pointer = deps.pointer || sessionFile(POINTER, hook && hook.session_id);
  const launched = launchedStatePath(hook);
  if (launched) try { writeSessionFile(pointer, launched); } catch { /* advisory */ }
  let store = activeStore(cwd);
  if (!store) {
    const root = pointedRoot(pointer);
    if (root && path.resolve(root) !== path.resolve(cwd)) store = activeStore(root);
  }
  if (!store) return null;
  const version = waitingVersion(readJson(path.join(store, 'state.json')));
  if (version === null) return null;
  const marker = path.join(store, NOTIFIED);
  const seen = readJson(marker);
  if (seen && seen.version === version) return null;

  const current = (deps.readTitle || readCurrentTitle)(hook && hook.transcript_path);
  // Unknown title or anything but the waiting prefix: nothing to take back.
  if (current === null || !current.startsWith(CONCEPT_PREFIX)) return null;

  try { fs.writeFileSync(marker, JSON.stringify({ version, at: new Date().toISOString() })); } catch { return null; }
  const title = require('../lib/title-budget').clampTitle(CONCEPT_WORKING_PREFIX + stripPrefixes(current));
  return {
    context: [
      `${TAG} The user submitted concept decisions (v${version}); the sidebar still says it is their move. ` +
        `Desktop app only, once: mcp__ccd_session_mgmt__set_session_title {session_id:"self", title:${JSON.stringify(title)}} ` +
        'in the SAME message as your next tool call (parallel, no message of its own). No further tool call this turn → call it alone.',
      'Only deferred → ToolSearch "select:mcp__ccd_session_mgmt__set_session_title" in that batch, the set call in the next. ' +
        'Not even deferred, or it fails: skip silently. Processing the submission stays with auto-concept Step 5.',
      'Do not mention this to the user.',
    ].join('\n'),
  };
}

if (require.main === module) runHook(main, { event: 'PostToolUse' });

module.exports = { main, activeStore, waitingVersion, launchedStatePath };
