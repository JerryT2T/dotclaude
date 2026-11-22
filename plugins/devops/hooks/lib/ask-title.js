/**
 * @module ask-title
 * @version 0.5.0
 * @description The session title while a call waits for the user — an
 *   AskUserQuestion, an ExitPlanMode plan approval, or a start_session that
 *   asks the user ("offer", "user_asked": the app's approval card): the card
 *   sets `👉 ➜ ❓ ` only when a TURN ends on a question — a question
 *   asked mid-turn blocked with the ⏳ still on the title, so the sidebar said
 *   "Claude works" while the session waited for the user (2026-10-25).
 *
 *   Before the question (pre.ask.title): the title must carry the question
 *   prefix. A `set_session_title` to it in the same assistant message passes
 *   (Claude Code runs the MCP call before the blocking question); otherwise
 *   the question is refused ONCE per turn with the exact set call to send
 *   alongside the repeated question. After the answer (post.ask.title): the
 *   title goes back to the ⏳ head it had before the question.
 *
 *   The title comes off the transcript tail (lib/session-title.js). Unknown
 *   title (no Desktop app, no transcript) → never refuse, never instruct.
 *
 *   A session started with "user_asked" gets its title from this call, before
 *   its process even boots (45 s until its first prompt, observed 2026-11-04):
 *   startSessionInput puts the ⏳ head on it right there. The app keeps a
 *   start_session title as tool-set, so nothing later could prefix it faster.
 */

const S = require('./title-scheme');
const { clampTitle } = require('./title-budget');
const { launchMode, markerMode } = require('./side-sessions');
const { WORK_PREFIX, stripPrefixes, classify, leadingPrefix, approvalRestoredTitle } = S;

const MARKER = '[ask-title]';
const QUESTION_PREFIX = S.prefixOf('question');
const SET_TOOL = 'mcp__ccd_session_mgmt__set_session_title';
const START_TOOL = 'mcp__ccd_session__start_session';

/**
 * True when this tool call blocks until the user answers. start_session with
 * "own_initiative" only drops a proposal card and returns at once; every other
 * start waits on the user ("offer" asks, "user_asked" shows the app's
 * approval card even under bypass permissions — Backlog run, 2026-10-25).
 */
function isBlockingCall(name, input) {
  if (name === 'AskUserQuestion' || name === 'ExitPlanMode') return true;
  if (name !== START_TOOL) return false;
  // A follow-up start by proposal_id is the user's own click — no prompt.
  if (input && input.proposal_id && !input.initiation) return false;
  // A devops Home pane button is the person's own press: nothing waits on an answer.
  if (require('./home-pane').isHomePaneStart(input)) return false;
  return !(input && input.initiation === 'own_initiative');
}

/** True when `title` already says the session waits on a question. */
function isQuestionTitle(title) {
  if (typeof title !== 'string') return false;
  // A linked sub's 🔗 in front of the head does not change the state.
  const lead = S.leadingPrefix(title);
  return !!lead && (lead.sub ? lead.prefix === QUESTION_PREFIX : S.startsWithPrefix(title, QUESTION_PREFIX));
}

/**
 * The title a pending question needs, or null for "leave it": unknown or
 * empty, already a question, or a batch (its skill owns the title).
 *
 * @param {string|null} current
 * @returns {string|null}
 */
function questionTitle(current) {
  if (typeof current !== 'string' || !current.trim()) return null;
  if (isQuestionTitle(current) || classify(current) === 'batch') return null;
  const rest = stripPrefixes(current);
  return rest.trim() ? clampTitle(S.carrySubMark(current, QUESTION_PREFIX + rest)) : null;
}

/**
 * The title after the answer: the ⏳ head the title had before the question
 * (`previous`, e.g. a running ship), else the generic Solo head. Null when
 * the title no longer says Question — a rename meanwhile wins.
 *
 * @param {string|null} current
 * @param {string|null} previous the last non-question title before it
 * @returns {string|null}
 */
function restoredTitle(current, previous) {
  if (!isQuestionTitle(current)) return null;
  const rest = stripPrefixes(current);
  if (!rest.trim()) return null;
  let head = WORK_PREFIX;
  const kind = typeof previous === 'string' ? classify(previous) : 'plain';
  if (kind === 'shipping' || kind === 'process') head = leadingPrefix(previous).prefix;
  // A background agent's approval wait before the question: back to its ⏳ head.
  const waited = kind === 'approval' ? approvalRestoredTitle(previous) : null;
  if (waited) head = leadingPrefix(waited).prefix;
  return clampTitle(S.carrySubMark(current, head + rest));
}

/** The session handle the app would derive from the title, without the head. */
function nameFromTitle(title) {
  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 24).replace(/-+$/, '');
}

/**
 * The start_session input with its head on the title, or null for "leave
 * it". Every LOCAL start with a title gets it — except an unmarked own
 * proposal: it shows the title on a card, may never start, and is an
 * independent follow-up that get their normal head from the title-work hook
 * (concept 2026-11-21 rows 12, 13). The head is `⏳ ➜ 🤖 ` — a start the
 * parent LINKS (brief marker, or `user_asked` / `offer` — a task the user named: `launchMode`) gets `🔗 ` in front
 * and, when its brief has no marker, `[devops:handoff]` appended, so the new
 * session knows it is a sub (`subModeOfTranscript`). A cloud or SSH session runs
 * no title hook that would ever clear the head. The name is pinned too, or the
 * app would derive it from the head. Only `title`, `name` and `prompt` change,
 * all properties of the tool's schema: Claude Code (2.1.300) drops an unknown
 * key of a hook's updatedInput and denies the call on an input the tool rejects.
 *
 * Not covered: a start by `proposal_id` without its own `title` (the card's
 * title stays) — the new session's first prompt gets the head from the
 * title-work hook instead, with `🔗` when its brief carries the marker.
 *
 * @param {object} input
 * @returns {object|null}
 */
function startSessionInput(input) {
  if (!input) return null;
  // Linked = brief marker, or user_asked / offer (the user's own task, counts as handoff). Anything else gets its head from the title-work hook.
  const mode = launchMode(input);
  if (!mode) return null;
  if (input.target && input.target !== 'local') return null;
  if (input.host || input.preset) return null;
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || S.hasSubMark(title)) return null;
  const name = input.name || nameFromTitle(title);
  const headed = classify(title) === 'plain' ? WORK_PREFIX + title : title;
  const out = { ...input, title: clampTitle(S.withSubMark(headed)), ...(name ? { name } : {}) };
  if (typeof input.prompt === 'string' && markerMode(input.prompt) === null) out.prompt = `${input.prompt}\n\n[devops:${mode}]`;
  return out;
}

function parse(line) {
  if (!line.trim()) return null;
  try { return JSON.parse(line); } catch { return null; }
}

/** The user's prompt (not a tool result, not meta). */
function isPromptEntry(e) {
  if (!e || e.type !== 'user' || e.isMeta === true) return false;
  const c = e.message && e.message.content;
  if (typeof c === 'string') return true;
  return Array.isArray(c) && c.some((b) => b && b.type !== 'tool_result');
}

function resultText(b) {
  const c = b && b.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((x) => (x && typeof x.text === 'string' ? x.text : '')).join('\n');
  return '';
}

/**
 * What the current turn already did, read off the transcript tail:
 * `titleSet` — a set_session_title to a question title after the last
 * question; `refused` — this gate refused a question this turn.
 *
 * @param {string} text transcript tail
 * @param {string} [toolUseId] the pending question's id (skipped)
 */
function turnState(text, toolUseId) {
  let titleSet = false;
  let refused = false;
  for (const line of String(text || '').split('\n')) {
    const e = parse(line);
    if (!e || e.isSidechain) continue;
    if (isPromptEntry(e)) { titleSet = false; refused = false; continue; }
    const content = e.message && e.message.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (!b) continue;
      if (e.type === 'assistant' && b.type === 'tool_use') {
        if (b.name === SET_TOOL && isQuestionTitle(b.input && b.input.title)) titleSet = true;
        else if (isBlockingCall(b.name, b.input) && b.id !== toolUseId) titleSet = false;
      }
      if (e.type === 'user' && b.type === 'tool_result' && resultText(b).includes(MARKER)) refused = true;
    }
  }
  return { titleSet, refused };
}

/** The last title before the current question title, or null. */
function previousTitle(text) {
  const lines = String(text || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"type":"custom-title"')) continue;
    const e = parse(lines[i]);
    const t = e && e.type === 'custom-title' ? e.customTitle : undefined;
    if (typeof t === 'string' && !isQuestionTitle(t)) return t;
  }
  return null;
}

function setCall(title) {
  return `${SET_TOOL} {session_id:"self", title:${JSON.stringify(title)}}`;
}

/** The refusal: set the title, then repeat the question — one message. */
function refusalText(title) {
  return `${MARKER} The sidebar still shows ⏳ while this call waits for the user. ` +
    `Send ${setCall(title)} and this exact call again in ONE message, the title call first. ` +
    'Only deferred → load it with ToolSearch "select:' + SET_TOOL + '" first. ' +
    'For later questions put the set call in the same message right away. Do not mention this to the user.';
}

/** After the answer: restore the ⏳ head with the next tool call. */
function restoreText(title) {
  return `${MARKER} The user answered — Desktop app only: ${setCall(title)} in the SAME message as your next ` +
    'tool call (parallel, no message of its own). The turn ends with a completion card instead → skip it, the card sets the title. ' +
    'Fails or unavailable: skip silently. Do not mention this to the user.';
}

module.exports = {
  MARKER,
  QUESTION_PREFIX,
  isBlockingCall,
  isQuestionTitle,
  questionTitle,
  restoredTitle,
  startSessionInput,
  turnState,
  previousTitle,
  refusalText,
  restoreText,
  setCall,
};
