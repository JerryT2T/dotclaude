'use strict';
/**
 * @module title-plan
 * @description The pure half of `prompt.flow.title-work` (#1102 Part A): from
 *   the prompt and what the hook read off disk (the current title, whether this
 *   is the session's first prompt, a fresh transcript, a ship to resume) it
 *   computes the hook's whole answer — the instruction for the model and the
 *   `sessionTitle` the hook sets itself. No file, clock or process access, so a
 *   second writer can run the very same computation;
 *   `fixtures/title-work-parity.json` pins the hook output byte for byte.
 */
const { isMachineTurn } = require('../user-prompt-submit/prompt.flow.silent-turn');
const { isShipIntent, isDeferredShip } = require('./ship-intent');
const { ownWords } = require('./prompt-text');
const { TOPIC_MAX } = require('./title-budget');
const {
  WORK_PREFIX, LEGACY_PENDING_PREFIX, LEGACY_PREFIXES, SHIPPING_PREFIX, CONCEPT_PREFIX, BATCH_PREFIX,
  classify, nextTitle,
} = require('./session-title');
const ask = require('./ask-title');
const { markerMode } = require('./side-sessions');
const { STATUS, BARE_WORK } = require('./title-scheme');

/** How the app opens the first prompt of a session another session started. */
const SUB_SESSION_BRIEF = /^(Background|Task) \(from the session\b/;

/**
 * The prefix a prompt puts on the title: the process it starts when it
 * starts one (a ship → `⏳ ➜ 🚀 Shipping ┃ `), the bare hourglass otherwise. The
 * hourglass is the fallback, never the override. `resumesShip`: an
 * interrupted ship this prompt resumes (the hook reads it off disk).
 */
function prefixOf(prompt, resumesShip = false) {
  // "<work>, dann ship" works first — the ship's own title comes with do-ship.
  if (isShipIntent(prompt) && !isDeferredShip(prompt)) return SHIPPING_PREFIX;
  return resumesShip ? SHIPPING_PREFIX : WORK_PREFIX;
}

/**
 * The instruction when the hook already knows the current title: the exact
 * new title, set in parallel with the turn's first other tool call — no
 * get_session, no round trip of its own. Kept short: it is injected on
 * every marking prompt.
 */
function directInstruction(title, { shipping = false, conceptYields = false, topic = false } = {}) {
  return [
    '[prompt.flow.title-work] Desktop app only, once: mcp__ccd_session_mgmt__set_session_title ' +
      `{session_id:"self", title:${JSON.stringify(title)}} in the SAME message as this turn's first other tool call ` +
      '(parallel — no get_session, no message of its own). No other tool this turn → call it alone.',
    'Only deferred → ToolSearch "select:mcp__ccd_session_mgmt__set_session_title" in that first batch, the set call in the next. ' +
      'Not even deferred, or it fails: skip silently.',
    ...(topic ? [topicLine()] : []),
    ...questionLine(title),
    ...(shipping ? ['This is do-ship Pre-Step C done early.'] : []),
    ...(conceptYields ? ['The concept prefix yields (Claude works now); if the concept page stays open after this turn, its completion card (concept field + cwd) sets it again.'] : []),
    'Do not mention this to the user.',
  ].join('\n');
}

/**
 * The topic rule for a session's first prompt (user decision d-who, 2026-11-17:
 * "Nur das Modell"): the hook derives no topic from the prompt; until the model's
 * first tool call the app's own title stands, then the model's label replaces it.
 * Abbreviations are a hint only (d-abbr: no list, the length is enforced by
 * hooks/pre-tool-use/pre.title.topic.js).
 */
function topicLine() {
  return `First prompt of this session: in that call put a topic label of at most ${TOPIC_MAX} characters in place of the text after the "┃ " — a noun phrase naming the subject, ` +
    "not the prompt's opening words (abbreviations allowed, if needed). Set it once; a longer topic is refused. A title the user set themselves stays untouched.";
}

/**
 * True when the prompt is the brief of a LINKED sub (concept 2026-11-21): a
 * session's first prompt that carries `[devops:handoff]` / `[devops:deliver]` —
 * `pre.ask.title` adds the marker to a `user_asked` start that has none. Later
 * prompts keep the 🔗 through the title itself (`carrySubMark`).
 */
function isLinkedBrief(prompt, firstPrompt) {
  return (firstPrompt || isSubSessionBrief(prompt)) && markerMode(ownWords(prompt)) !== null;
}

/** True when the prompt is a sub-session's brief — its title comes from start_session. */
function isSubSessionBrief(prompt) {
  const line = ownWords(prompt).split('\n').map(l => l.trim()).find(Boolean);
  return !!line && SUB_SESSION_BRIEF.test(line);
}

/**
 * The exact call for a later blocking question this turn (P2: no refused
 * round) — empty for a title that keeps its own head (batch).
 */
function questionLine(title) {
  const q = ask.questionTitle(title);
  if (!q) return [];
  return [`Later this turn an AskUserQuestion / ExitPlanMode / start_session that waits on the user: ${ask.setCall(q)} ` +
    'FIRST in that same message (pre.ask.title refuses the call otherwise).'];
}

/**
 * Fallback for a FRESH session whose title is still unknown: it can only be
 * the app's own summary, so no prefix table — get it, prefix it.
 */
function freshInstruction(prefix = WORK_PREFIX, { topic = false } = {}) {
  const heads = [...new Set(Object.values(STATUS))].join(' ');
  return [
    '[prompt.flow.title-work] Desktop app only, once: mcp__ccd_session_mgmt__get_session {session_id:"self"} in the first tool batch of this turn; ' +
      `title non-empty and starting with none of ${heads} 📥 → mcp__ccd_session_mgmt__set_session_title {session_id:"self", title:"${prefix}" + title} with the next batch.`,
    ...(topic ? [topicLine()] : []),
    'Deferred → ToolSearch "select:mcp__ccd_session_mgmt__get_session,mcp__ccd_session_mgmt__set_session_title" first. Unavailable or failing: skip silently. Do not mention this to the user.',
  ].join('\n');
}

/** Fallback when the current title is unknown: read it via get_session. */
function instruction(prefix = WORK_PREFIX, { machine = false } = {}) {
  const shipping = prefix === SHIPPING_PREFIX;
  const statuses = Object.values(STATUS).join(' ');
  // Legacy single-icon forms: one "<icon> <Word> – " shape plus the words (the
  // exact list stays in title-scheme.js LEGACY_PREFIXES, which the card shares).
  const legacyWords = [...new Set(LEGACY_PREFIXES.map(p => p.replace(/^\S+\s+/, '').replace(/ – $/, '')))];
  const known = `a known "<status> ➜ <activity> <Word> ┃ " prefix (status icon one of ${statuses}; also the older "<status> ┃ <activity> <Word> " and "<status> <activity> <Word> – " forms, with ⏸️ too), the bare "${BARE_WORK}", or a legacy "<icon> <Word> – " (Word: ${legacyWords.join(', ')})`;
  // A machine turn (a task notification — the concept's own watchers exit
  // that way) is no proof of work: it may end without a card, so it keeps its
  // hands off every known prefix (#618). Only a plain title (or the legacy
  // worded hourglass) is marked.
  const guards = machine
    ? [
      `  If the title is empty or starts with ${known} other than "${LEGACY_PENDING_PREFIX}": do nothing —`,
      '  a mode or a card owns it (this turn is no user prompt — an open concept page keeps its prefix, an outcome stays).',
    ]
    : [
      `  If the title is empty or starts with "${BATCH_PREFIX}" (or the legacy "📥 Batch – " / "👉 📥 Batch – "): do nothing — batch mode owns it.`,
      ...(shipping
        ? [`  Else if it already starts with "${SHIPPING_PREFIX}": do nothing — the ship is already marked.`]
        : [
          `  Else if it already starts with "${SHIPPING_PREFIX}" (or the legacy "🚀 Shipping – "): do nothing — a ship is running and the`,
          '  hourglass is only the fallback for work that is no named process.',
          '  Else if it starts with any other "⏳ ➜ <activity> <Word> ┃ " prefix (a running named process): do nothing.',
          `  Else if it already starts with "${WORK_PREFIX}" (or a bare "${BARE_WORK}<title>") and NOT "${LEGACY_PENDING_PREFIX}": do nothing.`,
        ]),
    ];
  const tail = shipping
    ? 'The word is exactly "Shipping" — this is the do-ship skill\'s Pre-Step C done early; the skill finds the title marked and leaves it.'
    : 'The generic prefix names no process — the title text stays as it is.';
  const conceptNote = machine ? [] : [
    `A "${CONCEPT_PREFIX}" title yields too: it means the page waits for the user, and now Claude works.`,
    'If a concept page stays open after this turn, end the turn with its completion card (concept field + cwd) — that card sets the concept prefix again.',
  ];
  return [
    shipping
      ? '[prompt.flow.title-work] New work in this session — a ship.'
      : '[prompt.flow.title-work] New work in this session.',
    'Before any other tool call, once, Desktop app only:',
    '  mcp__ccd_session_mgmt__get_session {session_id:"self"} → title.',
    ...guards,
    `  Else strip every leading ${known} — only those, never free text such as "Fix Login – " — and`,
    `  mcp__ccd_session_mgmt__set_session_title {session_id:"self", title: "${prefix}" + <stripped title>}.`,
    tail,
    ...conceptNote,
    'Deferred is not unavailable: if either tool is only in the deferred-tools list, load both once with',
    '  ToolSearch "select:mcp__ccd_session_mgmt__get_session,mcp__ccd_session_mgmt__set_session_title", then call them.',
    'If either tool is truly unavailable (not even deferred) or fails: skip silently — no retry, no note, no fallback.',
    'Do not mention this to the user.',
  ].join('\n');
}

/**
 * The hook's whole answer for one prompt.
 * @param {{ prompt: string, current: string|null, firstPrompt: boolean, fresh: boolean, resumesShip?: boolean }} input
 *   `current`: the title as Claude Code reports it (else transcript / sidecar), null when unknown;
 *   `firstPrompt`: no transcript yet; `fresh`: isFreshSession of the transcript.
 * @returns {{ context: string, sessionTitle: string|null }} `context` '' = nothing to do.
 */
function titlePlan({ prompt, current, firstPrompt, fresh, resumesShip = false, batchArmed, knownSub = false }) {
  const prefix = prefixOf(prompt, resumesShip);
  const machine = isMachineTurn(prompt);
  // The model names the topic on a user's first prompt (a sub-session's title comes from start_session).
  const topic = firstPrompt && !machine && !isSubSessionBrief(prompt);
  // knownSub: recorded earlier (side-sessions.js rememberSub) — brings a reset title's 🔗 back.
  const sub = knownSub || isLinkedBrief(prompt, firstPrompt);
  let context;
  if (current === null) {
    context = !machine && fresh ? freshInstruction(prefix, { topic }) : instruction(prefix, { machine });
  } else {
    const next = nextTitle(current, { prefix, machine, batchArmed, sub });
    context = next === null ? '' : directInstruction(next, {
      shipping: prefix === SHIPPING_PREFIX,
      conceptYields: classify(current) === 'concept-waiting',
      topic,
    });
  }
  return { context, sessionTitle: context ? earlyTitleOf({ prompt, current, firstPrompt, prefix, machine }) : null };
}

/**
 * The title the hook sets itself, without the model, or null: only on a session's
 * first prompt from the user, and only the prefix on the app's own title — never a
 * topic derived from the prompt (d-who: the model names the topic).
 */
function earlyTitleOf({ prompt, current, firstPrompt, prefix = prefixOf(prompt), machine = isMachineTurn(prompt), knownSub = false }) {
  if (machine || !firstPrompt || current === null) return null;
  return nextTitle(current, { prefix, sub: knownSub || isLinkedBrief(prompt, firstPrompt) });
}

/** The hook's stdout for a plan: plain context, or JSON when it sets the title itself too. */
function replyOf(plan) {
  if (!plan.context) return '';
  if (!plan.sessionTitle) return plan.context;
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: plan.context, sessionTitle: plan.sessionTitle } });
}

module.exports = { titlePlan, earlyTitleOf, replyOf, prefixOf, topicLine, directInstruction, freshInstruction, instruction, questionLine, SUB_SESSION_BRIEF };
