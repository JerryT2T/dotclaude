#!/usr/bin/env node
/**
 * @hook prompt.flow.title-work
 * @version 0.10.0
 * @event UserPromptSubmit
 * @plugin devops
 * @description Marks a session as "being worked on" in the sidebar: on the
 *   first real prompt of a session — and on the first prompt after every
 *   completion card — it asks Claude to put the generic `⏳ ➜ 🤖 Solo ┃ ` (no
 *   word — `SESSION_PREFIX.work` in mcp-server/lib/mode-state.js) in front of
 *   the session title, replacing whatever outcome prefix the last card left
 *   (📦 Ready, 🧪 Test, …). The hourglass is ONE state — "Claude works, not
 *   your move" — whether this turn runs or background work continues after
 *   it: a card with pending work sets the same Solo prefix. The worded
 *   `⏳ Working – ` of older versions is a legacy form, rewritten wherever
 *   it is still found. The app's
 *   own summary stays the title. The card that ends the turn sets the
 *   outcome prefix again, so the sidebar always says what the session is
 *   doing NOW — not what its last turn ended with. Observed 2026-09-20: a
 *   session sat on `🧪 Test –` for hours while a follow-up prompt had it
 *   implementing with background tasks.
 *
 *   Mode prefixes: `📥 Batch – ` stays untouched, its skill owns it for the
 *   mode's lifetime. `🧭 Concept – ` means "the page waits for YOU", so a
 *   user prompt swaps it for the hourglass too — Claude works now — and the
 *   card that ends the turn brings the compass back while the page still
 *   waits. Only a machine turn (a task notification — the concept's own
 *   watchers exit that way, and such a turn may end without a card) leaves
 *   the compass alone. `🚀 Shipping – `
 *   is a process prefix too: the bare hourglass is the FALLBACK for "being
 *   worked on" and never replaces a running process — so a title that already
 *   says Shipping keeps it, and a prompt that IS a ship (lib/ship-intent.js,
 *   the same classifier prompt.ship.detect uses) gets `🚀 Shipping – ` right
 *   here instead of the hourglass. Observed 2026-09-21: `/do-ship` after a
 *   change left `⏳` on the title for the whole pipeline whenever the model
 *   skipped the do-ship skill's own courtesy rename (Pre-Step C).
 *   A prompt that resumes an interrupted ship ("weiter" after a usage limit
 *   or a crash, lib/ship-resume.js) is a ship too: it gets `🚀 Shipping – `,
 *   never the hourglass.
 *
 *   Guarded by runOnce: the marker is taken here and given back by
 *   stop.flow.guard at every non-silent turn end (card or no card — since
 *   0.183.10; releasing only after a card let a card-less answer after a ship
 *   pin `🚀 Shipped – ` on the title for the rest of the session), so a
 *   multi-prompt turn costs one rename, not one per prompt. An outcome prefix
 *   therefore lives exactly one turn: `🚀 Shipped – ` stays only while the
 *   LAST thing this session did was a ship.
 *   Silent/cron turns and scheduled-task ticks are not user work — skipped.
 *   Desktop app only — the instruction tells Claude to skip silently when the
 *   session-mgmt tools are missing (terminal, unattended run).
 *
 *   Cost (0.6.0): the hook reads the current title from the transcript tail
 *   (lib/session-title.js) and computes the new one itself, so the
 *   instruction carries the exact title and asks for set_session_title in
 *   parallel with the turn's first other tool call — no get_session and no
 *   round trip of its own (the old ritual was 2–3 extra API calls per prompt,
 *   ~3.6 % of all tokens). Title already right → no output at all. Title
 *   unknown (no transcript, no title entry yet) → the old get_session
 *   instruction, so the semantics never break.
 *
 *   0.8.0: the title also comes from the app's sidecar
 *   (`<session>/custom-title.json`, lib/session-title.js readKnownTitle),
 *   which exists before the transcript carries a title entry — so the first
 *   prompt gets the exact call too. Still unknown on a FRESH session (no
 *   earlier prompt in the transcript): the title can only be the app's own
 *   summary, so a short get_session → set fallback without the prefix-strip
 *   table (freshInstruction). The long table stays for an unknown title in
 *   an old session only.
 *   The direct instruction also names the exact question-title call
 *   (`👉 ➜ ❓ Question ┃ <title>`, lib/ask-title.js) to send in the same
 *   message as a later AskUserQuestion / ExitPlanMode / start_session that
 *   waits on the user — pre.ask.title then has nothing to refuse, and its
 *   one block per turn stays only for a model that ignored the line.
 *
 *   0.10.0 (#1102 Part A): the computation moved, unchanged, into the pure
 *   lib/title-plan.js; this hook only reads the title, the transcript and the
 *   ship state off disk. lib/fixtures/title-work-parity.json pins the output.
 *
 *   0.9.0 (the hourglass came 26 s after the prompt, median of 15 sessions,
 *   2026-11-04): Claude Code creates the transcript only AFTER the
 *   UserPromptSubmit hooks, so neither the transcript nor the sidecar can know
 *   a first prompt's title and 16 of 16 first prompts took the slow fresh
 *   fallback. Two changes:
 *   - The title comes from the hook input first (`session_title`, Claude Code's
 *     own current name).
 *   - On a session's first prompt the hook sets the title itself:
 *     `hookSpecificOutput.sessionTitle` is applied before the first API call, no
 *     model round. The app adopts it only while its title is empty or
 *     app-generated (SessionTitleSync.yieldsToProposedTitle) — a title set by a
 *     tool or the user stays, so the instruction to the model remains the
 *     second stage. Never on a later prompt: by then the title is tool-set, the
 *     sidebar would ignore the hook, and the transcript would claim a ⏳ the
 *     sidebar does not show (the next prompt would then skip its rename).
 *     Unknown title: the prompt's first words stand in until the app's summary
 *     replaces them; a sub-session's brief never does (its title comes from
 *     start_session, see lib/ask-title.js startSessionInput).
 */

require('../lib/plugin-guard');

const fs = require('fs');
const { runOnce, releaseOnce } = require('../lib/run-once');
const { isSilent, isScheduledTask, isMachineTurn } = require('./prompt.flow.silent-turn');
const { isShipIntent, isDeferredShip } = require('../lib/ship-intent');

/** An interrupted ship this prompt resumes, or null — never fatal. */
function resumesShip(prompt, cwd) {
  try { return !!require('../lib/ship-resume').shipResumeFor(prompt, cwd); } catch { return false; }
}


/** The runOnce token name — stop.flow.guard releases it after a card. */
const ONCE_KEY = 'prompt-title-work';

// Prefix strings and rules live in lib/session-title.js / lib/title-scheme.js
// (shared with the completion card); re-exported here so callers and tests
// keep one import.
const {
  WORK_PREFIX, LEGACY_PENDING_PREFIX, LEGACY_PREFIXES, SHIPPING_PREFIX, CONCEPT_PREFIX, BATCH_PREFIX,
  readKnownTitle, isFreshSession,
} = require('../lib/session-title');
// The pure computation (#1102 Part A): instructions, prefixes and the early title.
const {
  titlePlan, earlyTitleOf, replyOf, prefixOf, promptTopic, directInstruction, freshInstruction, instruction, questionLine,
} = require('../lib/title-plan');

/** The prefix for this prompt; the ship to resume is read off disk here, the rule is in lib/title-plan.js. */
function prefixFor(prompt, cwd) {
  if (isShipIntent(prompt) && !isDeferredShip(prompt)) return SHIPPING_PREFIX;
  return prefixOf(prompt, resumesShip(prompt, cwd));
}

/** The title Claude Code reports in the hook input, else the transcript / sidecar one. */
function currentTitle(hook) {
  const reported = hook && hook.session_title;
  if (typeof reported === 'string' && reported.trim()) return reported;
  return readKnownTitle(hook && hook.transcript_path);
}

/**
 * True on a session's very first prompt: the transcript is created after these
 * hooks, so it does not exist yet. isFreshSession also says yes on the second
 * prompt (one prompt in the transcript) — too late for a hook title.
 */
function isFirstPrompt(transcriptPath) {
  return typeof transcriptPath === 'string' && !!transcriptPath && !fs.existsSync(transcriptPath);
}

/** What the hook reads off disk, then the pure plan (lib/title-plan.js). */
function planFor(hook, prompt, cwd) {
  const current = currentTitle(hook);
  return titlePlan({
    prompt,
    current,
    firstPrompt: isFirstPrompt(hook.transcript_path),
    fresh: current === null ? isFreshSession(hook.transcript_path) : false,
    resumesShip: prefixFor(prompt, cwd) === SHIPPING_PREFIX,
    batchArmed: batchArmedIn(cwd),
  });
}

/** Collect mode state for the title: false only when known off (no mode file / expired), undefined when unreadable. */
function batchArmedIn(cwd) {
  if (typeof cwd !== 'string' || !cwd) return undefined;
  try { return require('../lib/batch-state').isModeActive(cwd); } catch { return undefined; }
}

/** The title the hook sets itself, without the model, or null (see 0.9.0 above). */
function earlyTitle(hook, prompt, cwd) {
  return earlyTitleOf({ prompt, current: currentTitle(hook), firstPrompt: isFirstPrompt(hook.transcript_path), prefix: prefixFor(prompt, cwd) });
}

/** The hook's stdout: plain context, or JSON when it sets the title itself too. */
function hookReply(hook, prompt, cwd) {
  return replyOf(planFor(hook, prompt, cwd));
}

/**
 * The output for this prompt: '' (title already right — nothing to do), the
 * direct instruction (title known), or the get_session fallback
 * (`instruction`) when the transcript does not reveal the title.
 */
function titleWorkOutput(hook, prompt, cwd) {
  return planFor(hook, prompt, cwd).context;
}

function shouldMark(hook) {
  const prompt = require('../lib/prompt-text').rawPrompt(hook);
  if (!prompt.trim()) return false;
  if (isSilent(prompt) || isScheduledTask(prompt)) return false;
  try { if (require('../lib/batch-state').willBeCollected(hook)) return false; }
  catch { /* fail open */ }
  return true;
}

/** Give the token back so the next real prompt re-marks the title. Called by
 *  stop.flow.guard once a completion card has rendered in the turn. */
function releaseTitleWork(sessionId) {
  return releaseOnce(ONCE_KEY, sessionId);
}

if (require.main === module) {
  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { inputData += d; });
  process.stdin.on('end', () => {
    let hook;
    try { hook = JSON.parse(inputData); } catch { process.exit(0); }
    if (!shouldMark(hook)) process.exit(0);
    if (!runOnce(ONCE_KEY, hook.session_id)) process.exit(0);
    const prompt = hook.prompt || hook.user_message || hook.message || '';
    const out = hookReply(hook, prompt, hook.cwd || process.cwd());
    if (out) process.stdout.write(out + '\n');
    // A machine turn that left the title alone must not hold the token: a
    // real user message later in the same turn (a "Do it here" click, a card
    // button) would otherwise find it taken and never mark the title (#1094).
    else if (isMachineTurn(prompt)) releaseOnce(ONCE_KEY, hook.session_id);
    process.exit(0);
  });
}

module.exports = { earlyTitle, hookReply, promptTopic, currentTitle, freshInstruction, questionLine, ONCE_KEY, WORK_PREFIX, LEGACY_PENDING_PREFIX, LEGACY_PREFIXES, SHIPPING_PREFIX, CONCEPT_PREFIX, BATCH_PREFIX, instruction, directInstruction, titleWorkOutput, prefixFor, shouldMark, releaseTitleWork };
