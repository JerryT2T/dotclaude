/**
 * @module title-budget
 * @version 2.0.0
 * @description One width rule for every session title the plugin composes:
 *   `<status> ➜ <icon> <topic>` — the part the Desktop sidebar shows after
 *   the status icons never exceeds TITLE_BUDGET characters (code points), the
 *   ellipsis included. Since title-scheme 3.0 the head carries no keyword and
 *   no bar, so that part is the topic alone (2.0.0; until then `<Word> ┃ `
 *   took 7–18 of the 42).
 *
 *   Why 42: measured from the user's screenshot (2026-11-08). In the default
 *   ~440 px sidebar the text after the two status icons is cut after 43–46
 *   characters ("Team | Ich würde gern auf der Haiku-Seite unte", "Concept |
 *   Lass uns nochmal das konzept nach", "Aborted | Anno: Screenshot minimiert,
 *   DirectX"). The sidebar width cannot be read from a hook, so the rule is
 *   fixed; a little below the measured minimum so the ellipsis stays visible
 *   too.
 *
 *   The topic budget is `TITLE_BUDGET − headWidth`: what the head takes beyond
 *   `<status> ➜ <icon> ` — the two further robots of a Team head, the
 *   `<Word> ┃ ` of a worded head from before 3.0. `clampTitle` is idempotent
 *   and a topic that already ends in `…` is un-ellipsed before it is cut
 *   again — `……` never stacks.
 *
 *   A linked sub's `🔗 ` marker sits in the status area too and takes
 *   SUB_MARK_WIDTH from the topic: the topic is shortened, never the head.
 */

const { leadingPrefix, SUB_MARK_WIDTH, ARROW, HAIR, FE0F } = require('./title-scheme');

/** Characters the sidebar shows after `<status> ➜ <icon> ` (see above). */
const TITLE_BUDGET = 42;
/**
 * The topic the MODEL sets itself is at most this long; pre.title.topic
 * enforces it. 30 since the head lost its keyword (user decision 2026-11-22:
 * the freed room goes to the topic; 20 before, decision l20 of 2026-11-17).
 * TITLE_BUDGET stays the outer clamp for topics composed by hooks.
 */
const TOPIC_MAX = 30;
/** Sidebar columns of an emoji. */
const ICON_WIDTH = 2;
/** A word-boundary cut may lose at most this many characters. */
const WORD_CUT_MAX_LOSS = 8;
const ELLIPSIS = '…';

const cp = (s) => Array.from(s);

/**
 * The topic cut to fit `TITLE_BUDGET − taken` code points, ellipsis counted
 * inside. A topic that fits stays as it is. Idempotent.
 *
 * @param {string} topic
 * @param {number} [taken] characters the head takes from the budget
 *   (`headWidth`, plus the sub marker `🔗 `)
 * @returns {string}
 */
function clampTopic(topic, taken = 0) {
  const max = Math.max(4, TITLE_BUDGET - taken);
  let t = String(topic ?? '');
  const hadEllipsis = /…\s*$/.test(t);
  t = t.replace(/\s*…+\s*$/, '');
  const chars = cp(t);
  if (chars.length <= max && !hadEllipsis) return t;
  if (chars.length + 1 <= max && hadEllipsis) return t + ELLIPSIS;
  const keep = chars.slice(0, max - 1);
  let cut = keep.length;
  if (chars[keep.length] !== ' ') {
    const space = keep.lastIndexOf(' ');
    if (space > 0 && keep.length - space <= WORD_CUT_MAX_LOSS) cut = space;
  }
  const head = chars.slice(0, cut).join('').replace(/[\s,;:\-–—]+$/, '');
  return head + ELLIPSIS;
}

/**
 * What a leading prefix takes from the budget beyond `<status> ➜ <icon> `:
 * 0 for a plain head (`⏳ ➜ 🚀 `), two columns per further icon (`⏳ ➜ 🤖🤖🤖 `
 * → 4), the `<Word> ┃ ` of a worded head from before 3.0
 * (`🟩 ➜ 🚀 Released Alpha ┃ ` → 17). Null for a prefix without the arrow
 * (bare ⏳, older forms).
 *
 * @param {string} prefix
 * @returns {number|null}
 */
function headWidth(prefix) {
  const p = String(prefix ?? '').split(HAIR).join('').split(FE0F).join('');
  const at = p.indexOf(ARROW);
  if (at < 0) return null;
  const [icons = '', ...words] = p.slice(at + 1).trim().split(/\s+/);
  const word = words.join(' ');
  return (Math.max(1, cp(icons).length) - 1) * ICON_WIDTH + (word ? cp(word).length + 1 : 0);
}

/**
 * A full title with its topic clamped by what its leading prefix takes.
 * Titles without a `<status> ➜ <icon> ` head (plain, bare ⏳, older forms)
 * come back unchanged.
 *
 * @param {string|null} title
 * @returns {string|null}
 */
function clampTitle(title) {
  if (typeof title !== 'string') return title;
  const lead = leadingPrefix(title);
  const taken = lead ? headWidth(lead.prefix) : null;
  if (taken === null) return title;
  const head = title.slice(0, lead.length);
  const rest = title.slice(lead.length);
  return rest.trim() ? head + clampTopic(rest, taken + (lead.sub ? SUB_MARK_WIDTH : 0)) : title;
}

/**
 * The topic of a title with a `<status> ➜ <icon> ` head (the text after the
 * head, trimmed), or null for a title without such a head.
 *
 * @param {string|null} title
 * @returns {string|null}
 */
function topicOf(title) {
  if (typeof title !== 'string') return null;
  const lead = leadingPrefix(title);
  if (!lead || headWidth(lead.prefix) === null) return null;
  return title.slice(lead.length).trim();
}

module.exports = { TITLE_BUDGET, TOPIC_MAX, topicOf, clampTopic, clampTitle, headWidth };
