/**
 * @module title-scheme
 * @version 3.0.0
 * @description The ONE table behind the session title and the completion
 *   card's CTA heading (concept 2026-10-21 "title-iconography").
 *
 *   Grammar (3.0): `<STATUS> ➜ <ACTIVITY> <title>` — a status icon, an arrow
 *   (U+279C) and the activity emoji, then the topic. The sidebar title
 *   carries NO keyword and no bar any more (user decision 2026-11-22: the
 *   room goes to the topic); Team work shows three robots (`⏳ ➜ 🤖🤖🤖 `,
 *   TITLE_ACTIVITY) so it still differs from Solo. The keyword lives on in
 *   the CTA heading of every card (`👉 📦 Ready — Shippen?`): status and
 *   activity of title and heading are built here from one state id, so they
 *   cannot drift. States that share status and activity share a title head
 *   (Ready/Files, the three ⚠️, Released Alpha/Beta/Stable, …) — the card
 *   tells them apart. The 2.4–2.8 worded head
 *   (`<STATUS> ➜ <ACTIVITY> <Word> ┃ `, U+2503 heavy bar) is recognised and
 *   stripped, never emitted. No fill: 2.0.0 right-aligned the word with U+200A hair
 *   spaces, but the Desktop sidebar drops every whitespace run (verified
 *   2026-10-21), so titles from that release still carry an invisible fill.
 *
 *   STATUS is chosen by card content, not by variant name: a `done` state
 *   turns into the user's move (👉) when the card carries a mandatory user
 *   step (`head(id, { mandatory: true })`). Optional follow-ups keep 🟩.
 *
 *   Matching is FE0F-tolerant and hair-space-tolerant (any number of U+200A
 *   anywhere) and strips ONLY known prefixes: every status x activity
 *   combination of the current grammar, every status x keyword x activity
 *   combination of the 2.4–2.8 worded head, the 2.2/2.3 bar-first order
 *   (`<STATUS> ┃ <ACTIVITY> <Word> `), the 2.0/2.1 order
 *   (`<STATUS> ┃ <Word> <ACTIVITY> `, Started 💡 included), the LEGACY generation
 *   (`<STATUS> <ACTIVITY> <Word> – `, old keywords/icons, old ⏸️ status), the
 *   bare ⏳ and every single-icon prefix (`LEGACY_PREFIXES`). Free text such as
 *   "Fix Login – Bug" after a bare ⏳ is the title and stays (F6).
 *
 *   Approval wait (2.5): while a background agent waits on a tool permission
 *   dialog, a `⏳` Solo/Team head turns into the same head with 👉
 *   (`👉 ➜ 🤖🤖🤖 `) and back once the dialog is answered — the activity
 *   stays, only the status says whose move it is (`approvalTitle`,
 *   `approvalRestoredTitle`; hooks: perm.approval.*). classify() reads those
 *   heads as 'approval'. Testing left the swap with 3.0: without the keyword
 *   `👉 ➜ 🧪 ` IS the Test outcome.
 *
 *   Sub marker (2.8): a linked side session's title starts with `🔗 ` in front
 *   of its normal head; the parent's waiting heads (`⏳/👉 ➜ 🔗 Linked`) are
 *   states, the marker is not (`carrySubMark`).
 *
 *   CJS so hooks `require` it; mcp-server (ESM) loads it through
 *   `hookRequire("lib", "title-scheme.js")` in mcp-server/lib/mode-state.js.
 */

const FE0F = '️';
/** U+200A — built from the code point, the raw char is invisible in source. */
const HAIR = String.fromCharCode(0x200A);
/** U+2503 — the bar of the worded heads up to 2.8 (recognised, never emitted). */
const BAR = String.fromCharCode(0x2503);
/** U+279C — the arrow between status and activity. */
const ARROW = String.fromCharCode(0x279C);

/**
 * First icon — the status. 🟩 (not ✅) matches the red 🟥 box. 🔴 (2.7) is
 * a concept page whose bridge is gone (reboot, crash, app quit): the page
 * cannot reach Claude until the session is resumed — a round, not a box, so
 * it never reads as 🟥 Aborted.
 */
const STATUS = Object.freeze({
  work: '⏳',
  user: '👉',
  done: '🟩',
  aborted: '🟥',
  paused: '🟦',
  offline: '🔴',
});

/** Old paused status — still recognised on titles in the wild. */
const LEGACY_STATUS = Object.freeze({ ...STATUS, paused: '⏸️' });

/**
 * Every named state: [status key, English keyword, activity icon].
 * Status `done` may be raised to `user` by a mandatory user step.
 */
const STATES = Object.freeze({
  // ⏳ Claude works on a named process.
  shipping: ['work', 'Shipping', '🚀'],
  testing: ['work', 'Testing', '🧪'],
  agents: ['work', 'Team', '🤖'],
  // A marked side session runs ([devops:handoff]: it ships itself).
  linked: ['work', 'Linked', '🔗'],
  'concept-working': ['work', 'Concept', '🧭'],
  // 👉 the user's move.
  // A side session (handoff or deliver) waits on the user: Linked.
  'linked-waiting': ['user', 'Linked', '🔗'],
  'concept-waiting': ['user', 'Concept', '🧭'],
  batch: ['user', 'Batch', '📚'],
  test: ['user', 'Test', '🧪'],
  ready: ['user', 'Ready', '📦'],
  files: ['user', 'Files', '📦'],
  question: ['user', 'Question', '❓'],
  'red-tests': ['user', 'Red tests', '⚠' + FE0F],
  unverified: ['user', 'Unverified', '⚠' + FE0F],
  'not-deployed': ['user', 'Not deployed', '⚠' + FE0F],
  blocked: ['user', 'Blocked', '🚧'],
  interrupted: ['user', 'Interrupted', '⚡'],
  // 🟩 done — 👉 when a mandatory step rides along.
  // A merged ship — ring alpha or a plain merge without a ring — reads
  // "Released Alpha" (F3: one term everywhere; 2.3 added "Released").
  'released-alpha': ['done', 'Released Alpha', '🚀'],
  'released-beta': ['done', 'Released Beta', '🚀'],
  'released-stable': ['done', 'Released Stable', '🚀'],
  'promoted-beta': ['done', 'Beta', '🎊'],
  'promoted-stable': ['done', 'Stable', '🎊'],
  committed: ['done', 'Committed', '📦'],
  started: ['done', 'Started', '✨'],
  analysis: ['done', 'Analysis', '📊'],
  // A side session delivered its part; the main chat integrates and ships.
  delivered: ['done', 'Delivered', '📦'],
  system: ['done', 'System', '🖥' + FE0F],
  // 🟥 aborted — generic; a named abort keeps its activity (ABORT_ACTIVITY).
  aborted: ['aborted', 'Aborted', '📦'],
  'aborted-ship': ['aborted', 'Ship', '🚀'],
  'aborted-promote': ['aborted', 'Promote', '🎊'],
  'aborted-test': ['aborted', 'Test', '🧪'],
  'aborted-concept': ['aborted', 'Concept', '🧭'],
  'aborted-batch': ['aborted', 'Batch', '📚'],
  'aborted-analysis': ['aborted', 'Analysis', '📊'],
  'aborted-agents': ['aborted', 'Team', '🤖'],
  // 🟦 paused, per reason.
  'paused-user': ['paused', 'Paused', '✋'],
  // "Limit", not "Limit reset": the sidebar names the state, the card says when it ends.
  'paused-usage-reset': ['paused', 'Limit', '🔋'],
  'paused-restart': ['paused', 'Restart', '🔌'],
  'paused-reboot': ['paused', 'Reboot', '💻'],
  // 🔴 the concept page lost its bridge; resuming the session reconnects it
  // (ss.concept.resume relaunches the server). Set by ss.title.sweep only.
  'concept-offline': ['offline', 'Concept', '🧭'],
});

/**
 * The previous generation (`<STATUS> <ACTIVITY> <Word> – `): kept ONLY as a
 * recogniser so titles written by older versions are still stripped and
 * classified. Never emitted.
 */
const LEGACY_STATES = Object.freeze({
  shipping: ['work', '🚀', 'Shipping'],
  testing: ['work', '🧪', 'Testing'],
  agents: ['work', '🤖', 'Agents'],
  'concept-working': ['work', '🧭', 'Concept'],
  'concept-waiting': ['user', '🧭', 'Concept'],
  batch: ['user', '📥', 'Batch'],
  test: ['user', '🧪', 'Test'],
  ready: ['user', '📦', 'Ready'],
  files: ['user', '📦', 'Files'],
  question: ['user', '❓', 'Question'],
  'red-tests': ['user', '⚠️', 'Red tests'],
  unverified: ['user', '⚠️', 'Unverified'],
  'not-deployed': ['user', '⚠️', 'Not deployed'],
  blocked: ['user', '⛔', 'Blocked'],
  interrupted: ['user', '⚡', 'Interrupted'],
  'released-alpha': ['done', '🚀', 'Released Alpha'],
  'released-beta': ['done', '🎊', 'Released Beta'],
  'released-stable': ['done', '🎊', 'Released Stable'],
  'promoted-beta': ['done', '🎊', 'Promoted Beta'],
  'promoted-stable': ['done', '🎊', 'Promoted Stable'],
  committed: ['done', '📦', 'Committed'],
  started: ['done', '▶️', 'Started'],
  analysis: ['done', '📋', 'Analysis'],
  system: ['done', '🖥️', 'System'],
  aborted: ['aborted', '📦', 'Aborted'],
  'aborted-ship': ['aborted', '🚀', 'Ship'],
  'aborted-promote': ['aborted', '🎊', 'Promote'],
  'aborted-test': ['aborted', '🧪', 'Test'],
  'aborted-concept': ['aborted', '🧭', 'Concept'],
  'aborted-batch': ['aborted', '📥', 'Batch'],
  'aborted-analysis': ['aborted', '📋', 'Analysis'],
  'aborted-agents': ['aborted', '🤖', 'Agents'],
  'paused-user': ['paused', '✋', 'Paused'],
  'paused-usage-reset': ['paused', '🔋', 'Limit reset'],
  'paused-restart': ['paused', '🔄', 'Restart'],
  'paused-reboot': ['paused', '💻', 'Reboot'],
});

/** `cta.activity` of an aborted card → its named abort state. */
const ABORT_ACTIVITIES = Object.freeze(['ship', 'promote', 'test', 'concept', 'batch', 'analysis', 'agents']);

/** `pause.reason` → paused state id; `user` and anything unknown → paused-user. */
function pausedState(reason) {
  const r = String(reason ?? '').trim().toLowerCase();
  return STATES['paused-' + r] && r !== 'user' ? 'paused-' + r : 'paused-user';
}

/** `cta.activity` → aborted state id; unknown → the generic `🟥 ➜ 📦` (Aborted). */
function abortedState(activity) {
  const a = String(activity ?? '').trim().toLowerCase();
  return ABORT_ACTIVITIES.includes(a) ? 'aborted-' + a : 'aborted';
}

/**
 * The activity a TITLE shows for a keyword: the card's icon, except Team —
 * three robots, since the title no longer spells the word that told Team
 * from Solo. Card headings keep the single icon (`headingOf`).
 */
const TITLE_ACTIVITY = Object.freeze({ Team: '🤖🤖🤖' });
function titleActivity(word, activity) {
  return TITLE_ACTIVITY[word] || activity;
}

/** `👉 ➜ 📦` for a status icon, keyword and activity — the keyword only picks the title activity. */
function compose(status, word, activity) {
  return `${status} ${ARROW} ${titleActivity(word, activity)}`;
}

/** The 2.4–2.8 worded head `👉 ➜ 📦 Ready ┃` — recognised, never emitted. */
function composeWorded(status, word, activity) {
  return `${status} ${ARROW} ${activity} ${word} ${BAR}`;
}

/** The 2.2/2.3 order `👉 ┃ 📦 Ready` — recognised, never emitted. */
function composeBarFirst(status, word, activity) {
  return `${status} ${BAR} ${activity} ${word}`;
}

/** The 2.0/2.1 order `👉 ┃ Ready 📦` — recognised, never emitted. */
function composeWordFirst(status, word, activity) {
  return `${status} ${BAR} ${word} ${activity}`;
}

/**
 * The head of a state: status, keyword, activity (the card's icon) and the
 * joined title text (`👉 ➜ 📦`, no keyword, no fill). `mandatory` raises a
 * `done` state to the user's move.
 *
 * @param {string} id key of STATES
 * @param {{ mandatory?: boolean }} [opts]
 * @returns {{ id: string, status: string, activity: string, word: string, text: string }}
 */
function head(id, { mandatory = false } = {}) {
  const s = STATES[id];
  if (!s) throw new Error(`title-scheme: unknown state "${id}"`);
  const statusKey = s[0] === 'done' && mandatory ? 'user' : s[0];
  const status = STATUS[statusKey];
  return { id, status, activity: s[2], word: s[1], text: compose(status, s[1], s[2]) };
}

/** `👉 ➜ 📦 ` — the session-title prefix of a state. */
function prefixOf(id, opts) {
  return head(id, opts).text + ' ';
}

/**
 * `👉 📦 Ready — Shippen?` — the CTA heading of a state: the one place that
 * still spells the keyword (the title dropped it with 3.0).
 */
function headingOf(id, sentence, opts) {
  const { status, word, activity } = head(id, opts);
  const h = `${status} ${activity} ${word}`;
  const s = String(sentence ?? '').trim();
  return s ? `${h} — ${s}` : h;
}

/** Generic work: `⏳ ➜ 🤖 ` (Solo) — what a bare unnamed turn gets. */
const WORK_PREFIX = compose(STATUS.work, 'Solo', '🤖') + ' ';
/** The pre-2.0 bare hourglass — still recognised as generic work. */
const BARE_WORK = STATUS.work + ' ';

/** The running ship — checked before the generic-work shortcut (R1). */
const SHIPPING_PREFIX = prefixOf('shipping');
/** The /do-batch mode title. */
const BATCH_PREFIX = prefixOf('batch');
/** The concept page waits for the user / Claude works on it. */
const CONCEPT_PREFIX = prefixOf('concept-waiting');
const CONCEPT_WORKING_PREFIX = prefixOf('concept-working');
/** The concept page lost its bridge (reboot, crash) — resume reconnects it. */
const CONCEPT_OFFLINE_PREFIX = prefixOf('concept-offline');
/** F5: a turn that ended without a card. */
const INTERRUPTED_PREFIX = prefixOf('interrupted');
/** A usage limit stopped the session: set by the paused card, the mod band and ss.title.sweep. */
const LIMIT_PREFIX = prefixOf('paused-usage-reset');

/** Every single-icon prefix older versions set — still stripped (R4). */
const LEGACY_PREFIXES = Object.freeze([
  '⏳ Working – ',
  '🧭 Concept – ',
  '📥 Batch – ',
  '🚀 Shipping – ',
  '🚀 Shipped – ',
  '🎊 Released – ',
  '🎊 Released Alpha – ',
  '🎊 Released Beta – ',
  '🎊 Released Stable – ',
  '🎊 Promoted Beta – ',
  '🎊 Promoted Stable – ',
  '🧪 Test – ',
  '▶️ Started – ',
  '📦 Ready – ',
  '⛔ Blocked – ',
  '🚫 Aborted – ',
  '📋 Analysis – ',
  '🔧 Done – ',
  '⏸️ Paused – ',
  '⏸️ Paused until restart – ',
  '⏸️ Paused until reboot – ',
  '⏸️ Paused until limit reset – ',
]);

/** Legacy forms with a fixed meaning the guards still honour. */
const LEGACY = Object.freeze({
  working: '⏳ Working – ',
  concept: '🧭 Concept – ',
  batch: '📥 Batch – ',
  shipping: '🚀 Shipping – ',
  // Two-slot generation (pre-2.0).
  shippingTwoSlot: '⏳ 🚀 Shipping – ',
  conceptTwoSlot: '👉 🧭 Concept – ',
});

/**
 * The ⏳ heads [word, activity] that swap to 👉 while a background agent
 * waits on a tool approval. Shipping and a working concept keep their ⏳: a
 * ship and a concept round own their title. Testing keeps it too (3.0): its
 * 👉 form would read as the Test outcome.
 */
const APPROVAL_HEADS = Object.freeze([['Solo', '🤖'], ['Team', '🤖']]);
/**
 * Approval heads only the worded grammar had: `👉 ➜ 🧪 Testing ┃ `. Still read
 * as 'approval' and restored to `⏳ ➜ 🧪 `, so a title an older version left
 * while an agent waited does not stay on 👉; never produced any more.
 */
const LEGACY_APPROVAL_HEADS = Object.freeze([['Testing', '🧪']]);

/** Category of a canonical (fill-less) prefix → classify() result. */
const CATEGORY = new Map();
/** Canonical → every known prefix, used for matching. */
const KNOWN = [];

(function build() {
  const add = (prefix, category) => { KNOWN.push(prefix); CATEGORY.set(prefix, category); };
  const pick = (status, word, shipping, concept) => {
    if (word === 'Batch') return 'batch';
    if (shipping) return 'shipping';
    if (concept) return 'concept-waiting';
    return status === STATUS.work ? 'process' : 'outcome';
  };
  // Every status x (word, activity) pair, no fill.
  const pairs = new Map();
  for (const [, word, act] of Object.values(STATES)) pairs.set(word + ' ' + act, [word, act]);
  pairs.set('Solo 🤖', ['Solo', '🤖']);
  // Words retired by 2.3 ("Alpha 🚀" before "Released Alpha"), both orders.
  // "Limit reset 🔋" became "Limit" — titles in the wild still carry it.
  const retired = [['Alpha', '🚀'], ['Beta', '🚀'], ['Stable', '🚀'], ['Limit reset', '🔋']];
  const current = new Map([...pairs, ...retired.map((wa) => [wa.join(' '), wa])]);
  // The 2.0/2.1 word-first order, with the icons it used (Started 💡).
  const wordFirst = new Map([...current, ['Started 💡', ['Started', '💡']]]);
  // Current grammar (3.0): status x title activity, no keyword. Read by the
  // icons alone — states that share both share the category too.
  for (const st of Object.values(STATUS)) {
    for (const [word, act] of pairs.values()) {
      const p = compose(st, word, act) + ' ';
      if (CATEGORY.has(p)) continue;
      const icon = titleActivity(word, act);
      if (icon === '🤖') { add(p, st === STATUS.work ? 'work' : 'outcome'); continue; }
      add(p, icon === '📚' ? 'batch'
        : st === STATUS.work && icon === '🚀' ? 'shipping'
          : st === STATUS.user && icon === '🧭' ? 'concept-waiting'
            : st === STATUS.work ? 'process' : 'outcome');
    }
  }
  const orders = [[composeWorded, current], [composeBarFirst, current], [composeWordFirst, wordFirst]];
  for (const [build, list] of orders) {
    for (const st of Object.values(STATUS)) {
      for (const [word, act] of list.values()) {
        const p = build(st, word, act) + ' ';
        if (CATEGORY.has(p)) continue;
        if (word === 'Solo') { add(p, st === STATUS.work ? 'work' : 'outcome'); continue; }
        add(p, pick(st, word, st === STATUS.work && word === 'Shipping' && act === '🚀',
          st === STATUS.user && word === 'Concept'));
      }
    }
  }
  // Previous two-slot generation, old keywords and icons, old ⏸️ status.
  for (const st of Object.values(LEGACY_STATUS)) {
    for (const [, act, word] of Object.values(LEGACY_STATES)) {
      const p = `${st} ${act} ${word} – `;
      if (CATEGORY.has(p)) continue;
      add(p, pick(st, word, st === STATUS.work && word === 'Shipping',
        st === STATUS.user && word === 'Concept' && act === '🧭'));
    }
  }
  for (const p of LEGACY_PREFIXES) {
    if (CATEGORY.has(p)) continue;
    const cat = p === LEGACY.working ? 'work'
      : p === LEGACY.shipping ? 'shipping'
        : p === LEGACY.batch ? 'batch'
          : p === LEGACY.concept ? 'concept-waiting' : 'outcome';
    add(p, cat);
  }
  for (const [word, act] of APPROVAL_HEADS) {
    CATEGORY.set(compose(STATUS.user, word, act) + ' ', 'approval');
    CATEGORY.set(composeWorded(STATUS.user, word, act) + ' ', 'approval');
  }
  for (const [word, act] of LEGACY_APPROVAL_HEADS) CATEGORY.set(composeWorded(STATUS.user, word, act) + ' ', 'approval');
}());

/** Every known prefix but the bare ⏳, longest first. */
const KNOWN_PREFIXES = Object.freeze([...new Set(KNOWN)].sort((a, b) => b.length - a.length));

// A head that lost its status: an older plugin strips the leading ⏳ as its
// own bare prefix and stacks its prefix on the rest ("⏳ 🧭 Concept – ➜ 🚀 X",
// "… – ➜ 🚀 Shipping ┃ X", or "… – ┃ Shipping 🚀 X" for the bar-first orders).
// Stripped, never classified — the title gets a fresh head right after.
const ORPHAN_HEADS = Object.freeze([...new Set(
  [...KNOWN].filter((p) => p.includes(BAR) || p.includes(ARROW)).map((p) => p.slice(p.includes(ARROW) ? p.indexOf(ARROW) : p.indexOf(BAR))),
)].sort((a, b) => b.length - a.length));

/**
 * Length of `prefix` at the start of `t`, ignoring FE0F and U+200A on both
 * sides, or -1. A space in `prefix` takes a whole run of spaces in `t`: the
 * Desktop app stores the 2.0.0 hair-space fill as plain U+0020 (observed
 * 2026-10-21, "┃" + 25 spaces + "Solo 🤖"), and a fill the matcher missed
 * left every older head on the title, stacked one per turn.
 * @param {string} t
 * @param {string} prefix
 * @returns {number}
 */
function matchLength(t, prefix) {
  const skip = (c) => c === FE0F || c === HAIR;
  let i = 0;
  let j = 0;
  while (j < prefix.length) {
    if (skip(prefix[j])) { j++; continue; }
    if (skip(t[i])) { i++; continue; }
    if (i >= t.length || t[i] !== prefix[j]) return -1;
    i++; j++;
    if (prefix[j - 1] === ' ') while (t[i] === ' ' || skip(t[i])) i++;
  }
  return i;
}

/** True when `t` starts with `prefix` (FE0F- and hair-space-tolerant). */
function startsWithPrefix(t, prefix) {
  return matchLength(String(t ?? ''), prefix) >= 0;
}

/** A title prefix without fill/FE0F — the key into CATEGORY. */
function canonical(prefix) {
  return String(prefix).split(HAIR).join('');
}

/**
 * The sub marker (2.8): a LINKED side session carries `🔗 ` in front of its
 * normal head (`🔗 ⏳ ➜ 🚀 X`). It is no state of its own — every
 * helper below sees through it, and `carrySubMark` puts it back wherever a
 * head is rebuilt, so a status swap never loses it and it never stacks.
 */
const SUB_MARK = '🔗';
/** Sidebar width the marker takes from the topic (the icon and its space). */
const SUB_MARK_WIDTH = 2;

/** Length of a leading sub marker + space in `t` (0 = none); only before a known head. */
function subMarkLength(t) {
  const s = String(t ?? '');
  if (!s.startsWith(SUB_MARK)) return 0;
  const n = matchLength(s, SUB_MARK + ' ');
  return n > 0 && leadingPrefixOf(s.slice(n)) ? n : 0;
}

/** True when `title` starts with the sub marker in front of a known head. */
function hasSubMark(title) {
  return subMarkLength(title) > 0;
}

/**
 * `title` with exactly one leading sub marker: added when missing, never
 * stacked. A title without a known head stays as it is.
 */
function withSubMark(title) {
  const t = String(title ?? '');
  if (hasSubMark(t)) return t;
  return leadingPrefixOf(t) ? SUB_MARK + ' ' + t : t;
}

/**
 * `next` carries the sub marker when `current` does, or when the caller knows
 * the session is a linked sub (`sub`). A `null` next stays null.
 */
function carrySubMark(current, next, sub = false) {
  if (typeof next !== 'string') return next;
  return sub || hasSubMark(current) ? withSubMark(next) : next;
}

function leadingPrefixOf(t) {
  for (const p of KNOWN_PREFIXES) {
    const n = matchLength(t, p);
    if (n >= 0) return { prefix: p, length: n };
  }
  const n = matchLength(t, BARE_WORK);
  return n >= 0 ? { prefix: BARE_WORK, length: n } : null;
}

/**
 * The leading known prefix of `title`: `{ prefix, length }` (the canonical
 * prefix string, fill-less, and how many code units of `title` it covers),
 * the bare ⏳ as `{ prefix: BARE_WORK, … }`, or null for a plain title. A
 * leading sub marker is covered by `length` (and flagged `sub: true`) but is
 * not part of `prefix`.
 */
function leadingPrefix(title) {
  const t = String(title ?? '');
  const m = subMarkLength(t);
  const lead = leadingPrefixOf(t.slice(m));
  if (!lead) return null;
  return m ? { prefix: lead.prefix, length: m + lead.length, sub: true } : lead;
}

/**
 * `title` without every leading known prefix (stacked ones, either
 * generation, included). Only known prefixes go: "⏳ Fix Login – Bug" →
 * "Fix Login – Bug" (F6).
 *
 * @param {string} title
 * @returns {string}
 */
function stripPrefixes(title) {
  let t = String(title ?? '');
  for (;;) {
    const lead = leadingPrefix(t);
    if (lead) { t = t.slice(lead.length); continue; }
    const orphan = ORPHAN_HEADS.map((p) => matchLength(t, p)).find((n) => n >= 0);
    if (orphan === undefined) return t;
    t = t.slice(orphan);
  }
}

/**
 * The state of a title, read off its leading prefix (either generation):
 * - 'plain'      no known prefix
 * - 'work'       `⏳ ➜ 🤖 ` (or the bare ⏳ / legacy `⏳ Working – `)
 * - 'shipping'   `⏳ ➜ 🚀 ` (or the legacy forms)
 * - 'batch'      any status + 📚 (Batch)
 * - 'concept-waiting' `👉 ➜ 🧭 ` (or the legacy forms)
 * - 'process'    any other ⏳ prefix (Concept working, Team, Testing)
 * - 'approval'   `👉 ➜ 🤖🤖🤖 ` (Team) / `👉 ➜ 🤖 ` (Solo) — a background
 *                agent waits on a tool approval (approvalTitle)
 * - 'outcome'    any other known prefix (a card's outcome, legacy included)
 *
 * @param {string} title
 * @returns {'plain'|'work'|'shipping'|'batch'|'concept-waiting'|'process'|'approval'|'outcome'}
 */
function classify(title) {
  const lead = leadingPrefix(title);
  if (!lead) return 'plain';
  if (lead.prefix === BARE_WORK) return 'work';
  return CATEGORY.get(lead.prefix) || 'outcome';
}

/** The APPROVAL_HEADS pair behind `prefix` (current or worded head) under `status`, or undefined. */
function approvalHead(prefix, status) {
  const hit = APPROVAL_HEADS.find(([word, act]) => prefix === compose(status, word, act) + ' '
    || prefix === composeWorded(status, word, act) + ' ');
  // The worded Testing head only on its way back to ⏳ — a ⏳ Testing head never swaps to 👉 (3.0).
  if (hit || status !== STATUS.user) return hit;
  return LEGACY_APPROVAL_HEADS.find(([word, act]) => prefix === composeWorded(status, word, act) + ' ');
}

/**
 * The title while a background agent waits on a tool approval: the ⏳ head
 * with 👉 in its status slot, activity kept (`⏳ ➜ 🤖🤖🤖 X` →
 * `👉 ➜ 🤖🤖🤖 X`; a bare or legacy ⏳ counts as Solo). Null — leave the
 * title — for every other state: a ship, a working concept, a batch, an
 * outcome, a question, a title that already waits, and an unknown title.
 *
 * @param {string|null} title
 * @returns {string|null}
 */
function approvalTitle(title) {
  if (typeof title !== 'string' || !title.trim()) return null;
  const kind = classify(title);
  const rest = stripPrefixes(title);
  if (!rest.trim()) return null;
  if (kind === 'work') return carrySubMark(title, compose(STATUS.user, 'Solo', '🤖') + ' ' + rest);
  if (kind !== 'process') return null;
  const pair = approvalHead(leadingPrefix(title).prefix, STATUS.work);
  return pair ? carrySubMark(title, compose(STATUS.user, pair[0], pair[1]) + ' ' + rest) : null;
}

/**
 * The title once the approval is answered: an approval head back to its ⏳
 * head (`👉 ➜ 🤖🤖🤖 X` → `⏳ ➜ 🤖🤖🤖 X`). Null when the title is no
 * approval head any more — a card or a rename meanwhile wins.
 *
 * @param {string|null} title
 * @returns {string|null}
 */
function approvalRestoredTitle(title) {
  if (typeof title !== 'string' || classify(title) !== 'approval') return null;
  const rest = stripPrefixes(title);
  if (!rest.trim()) return null;
  const pair = approvalHead(leadingPrefix(title).prefix, STATUS.user);
  return pair ? carrySubMark(title, compose(STATUS.work, pair[0], pair[1]) + ' ' + rest) : null;
}

/** Every prefix a state can leave on a title (status raised included). */
function allStatePrefixes() {
  const out = new Set();
  for (const id of Object.keys(STATES)) {
    out.add(prefixOf(id));
    out.add(prefixOf(id, { mandatory: true }));
  }
  return [...out];
}

module.exports = {
  FE0F,
  HAIR,
  BAR,
  ARROW,
  STATUS,
  STATES,
  LEGACY_STATES,
  ABORT_ACTIVITIES,
  WORK_PREFIX,
  BARE_WORK,
  SHIPPING_PREFIX,
  BATCH_PREFIX,
  CONCEPT_PREFIX,
  CONCEPT_WORKING_PREFIX,
  CONCEPT_OFFLINE_PREFIX,
  INTERRUPTED_PREFIX,
  LIMIT_PREFIX,
  LEGACY_PREFIXES,
  LEGACY,
  KNOWN_PREFIXES,
  canonical,
  head,
  prefixOf,
  headingOf,
  pausedState,
  abortedState,
  matchLength,
  startsWithPrefix,
  leadingPrefix,
  stripPrefixes,
  classify,
  allStatePrefixes,
  APPROVAL_HEADS,
  TITLE_ACTIVITY,
  titleActivity,
  approvalTitle,
  approvalRestoredTitle,
  SUB_MARK,
  SUB_MARK_WIDTH,
  hasSubMark,
  withSubMark,
  carrySubMark,
};
