/**
 * @module title-budget
 * @version 1.0.0
 * @description One width rule for every session title the plugin composes:
 *   `<status> ➜ <icon> <Word> ┃ <topic>` — the part the Desktop sidebar shows
 *   after the status icons, `<Word> ┃ <topic>`, never exceeds TITLE_BUDGET
 *   characters (code points), the ellipsis included.
 *
 *   Why 42: measured from the user's screenshot (2026-11-08). In the default
 *   ~440 px sidebar the text after the two status icons is cut after 43–46
 *   characters of `<Word> | <topic>` ("Team | Ich würde gern auf der Haiku-Seite
 *   unte", "Concept | Lass uns nochmal das konzept nach", "Aborted | Anno:
 *   Screenshot minimiert, DirectX"). The sidebar width cannot be read from a
 *   hook, so the rule is fixed; a little below the measured minimum so the
 *   ellipsis stays visible too.
 *
 *   The topic budget is `TITLE_BUDGET − Word − 3` (the three are ` ┃ `), so a
 *   word switch (Solo → Aborted) re-clamps: `clampTitle` is idempotent and a
 *   topic that already ends in `…` is un-ellipsed before it is cut again —
 *   `……` never stacks.
 */

const { leadingPrefix } = require('./title-scheme');

/** Characters of `<Word> ┃ <topic>` the sidebar shows (see above). */
const TITLE_BUDGET = 42;
/** ` ┃ ` between the word and the topic. */
const SEPARATOR_WIDTH = 3;
/** A word-boundary cut may lose at most this many characters. */
const WORD_CUT_MAX_LOSS = 8;
const ELLIPSIS = '…';

const cp = (s) => Array.from(s);

/**
 * The topic cut to fit `TITLE_BUDGET − word − 3` code points, ellipsis counted
 * inside. A topic that fits stays as it is. Idempotent.
 *
 * @param {string} word the activity word of the head ("Solo", "Released Alpha")
 * @param {string} topic
 * @returns {string}
 */
function clampTopic(word, topic) {
  const max = Math.max(4, TITLE_BUDGET - cp(String(word ?? '')).length - SEPARATOR_WIDTH);
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

/** The word of a leading prefix (`🟩 ➜ 🚀 Released Alpha ┃ ` → "Released Alpha"), or null. */
function wordOf(prefix) {
  const m = /➜\s*\S+\s+(.+?)\s*┃/u.exec(String(prefix).split(String.fromCharCode(0x200A)).join(''));
  return m ? m[1].trim() : null;
}

/**
 * A full title with its topic clamped by the word of its leading prefix.
 * Titles without a `<status> ➜ <icon> <Word> ┃` head (plain, bare ⏳, legacy
 * forms) come back unchanged.
 *
 * @param {string|null} title
 * @returns {string|null}
 */
function clampTitle(title) {
  if (typeof title !== 'string') return title;
  const lead = leadingPrefix(title);
  const word = lead && wordOf(lead.prefix);
  if (!word) return title;
  const head = title.slice(0, lead.length);
  const rest = title.slice(lead.length);
  return rest.trim() ? head + clampTopic(word, rest) : title;
}

module.exports = { TITLE_BUDGET, clampTopic, clampTitle, wordOf };
