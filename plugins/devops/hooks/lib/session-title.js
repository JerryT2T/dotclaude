/**
 * @module session-title
 * @version 0.8.0
 * @description Reads the session's CURRENT sidebar title straight from the
 *   transcript and computes the next one, so a title instruction can hand
 *   Claude the exact `set_session_title` value instead of a
 *   `get_session` → strip → set ritual. Every extra tool round trip re-reads
 *   the whole context: the ritual cost ~3.6 % of all tokens (measured over
 *   100 sessions, ~940 calls). With the title known, the set call rides along
 *   in the turn's first tool batch — no extra API call at all.
 *
 *   Source: the Desktop app appends `{"type":"custom-title","customTitle":…}`
 *   (and a mirroring `{"type":"agent-name","agentName":…}`) to the session
 *   transcript on every rename and re-appends it every few lines, so the last
 *   one sits near the end of the file. Transcripts reach 30 MB — only the tail
 *   is read, growing backwards up to `maxBytes`. `null` means "unknown" (no
 *   transcript, no entry in reach): callers fall back to `get_session`.
 *
 *   The prefix strings and the matching live in lib/title-scheme.js — the
 *   one table the completion card's CTA headings are built from too.
 *   CJS so hooks `require` it; mcp-server (ESM) loads it through
 *   `hookRequire("lib", "session-title.js")` in mcp-server/lib/mode-state.js.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  WORK_PREFIX, SHIPPING_PREFIX, BATCH_PREFIX, CONCEPT_PREFIX, CONCEPT_WORKING_PREFIX,
  INTERRUPTED_PREFIX, LEGACY_PREFIXES, LEGACY, stripPrefixes, classify, leadingPrefix,
  hasSubMark, withSubMark, carrySubMark, BAR,
} = require('./title-scheme');
const { clampTitle, clampTopic, headWidth } = require('./title-budget');
const { batchTopic } = require('./batch-topic');

/** Legacy worded hourglass — rewritten to the bare form wherever found. */
const LEGACY_PENDING_PREFIX = LEGACY.working;

/** Code units of the sub marker and its space. */
const SUB_LEN = 3;

/**
 * True when `current` is generic work in a form no code emits any more: the
 * legacy `⏳ Working – ` or the worded Solo head (keyword + U+2503 bar) of
 * before title-scheme 3.0. Such a title is re-marked instead of left alone.
 */
function isStaleWork(current) {
  if (classify(current) !== 'work') return false;
  const { prefix } = leadingPrefix(current);
  return prefix === LEGACY_PENDING_PREFIX || prefix.includes(BAR);
}

/** `current` without its leading prefixes, or null when nothing is left. */
function rest(current) {
  const r = stripPrefixes(current);
  return r.trim() ? r : null;
}

/**
 * The title prefix work on this prompt should leave, applied to `current`:
 * the new title, or `null` for "leave it as it is". The guards read the
 * two-slot grammar (R1) and check the running ship first:
 *
 * User prompt (`prefix` = WORK_PREFIX): the batch title is owned by its
 * skill; a running `⏳ ➜ 🚀 ` (or its legacy form) is never
 * replaced, nor is any other ⏳ process (Concept working, Agents, Testing);
 * a title that carries the work prefix or the bare `⏳ ` is already marked
 * (the legacy `⏳ Working – ` and the worded Solo head before 3.0 are not).
 * Every other prefix — a waiting concept and every outcome — yields to the
 * bare hourglass; the turn's card sets the next state.
 *
 * A ship (`prefix` = SHIPPING_PREFIX): everything but the batch and an
 * already running ship becomes `⏳ ➜ 🚀 ` (a legacy
 * `🚀 Shipping – ` is upgraded).
 *
 * Machine turn (a task notification): any known prefix stays — only a plain
 * title or the legacy worded hourglass is marked.
 *
 * @param {string|null} current the title now (`readCurrentTitle`)
 * @param {{ prefix?: string, machine?: boolean, batchArmed?: boolean, sub?: boolean }} [opts]
 *   `batchArmed`: false only when the collect mode is known to be off — a
 *   `👉 ➜ 📚` batch head is then stale and stripped; unknown keeps it.
 * @returns {string|null}
 */
function nextTitle(current, opts = {}) {
  const next = nextTitleCore(current, opts);
  // A linked sub (`opts.sub`, the brief marker of its first prompt) whose title
  // lacks the 🔗 yet gets it even when the head stays.
  if (next === null && opts.sub && typeof current === 'string' && !hasSubMark(current)) {
    const marked = withSubMark(current);
    return marked !== current ? clampTitle(marked) : null;
  }
  return next;
}

function nextTitleCore(current, { prefix = WORK_PREFIX, machine = false, batchArmed, sub = false } = {}) {
  if (typeof current !== 'string' || !current.trim()) return null;
  const kind = classify(current);
  const legacyWorking = isStaleWork(current);
  const r = rest(current);
  if (r === null) return null;
  let next;
  if (machine) {
    if (kind !== 'plain' && !legacyWorking) return null;
    next = WORK_PREFIX + r;
  } else if (kind === 'batch') {
    // Batch mode owns its head while it collects. `batchArmed === false` (known off — the band's Off button ends
    // the mode without a turn, and a mod cannot rename) → the stale head goes with this prompt's work prefix.
    if (batchArmed !== false) return null;
    const topic = unbatchTitle(current);
    if (!topic) return null;
    next = prefix + topic;
  } else if (kind === 'shipping') {
    if (prefix !== SHIPPING_PREFIX || leadingPrefix(current).prefix === SHIPPING_PREFIX) return null;
    next = SHIPPING_PREFIX + r;
  } else if (prefix === SHIPPING_PREFIX) {
    next = SHIPPING_PREFIX + r;
  } else if (kind === 'process' || (kind === 'work' && !legacyWorking)) {
    return null;
  } else {
    next = prefix + r;
  }
  next = clampTitle(carrySubMark(current, next, sub));
  return next !== current ? next : null;
}

/**
 * The title arming /do-batch leaves (activation.md § Session title prefix):
 * `👉 ➜ 📚 ` in front, every known prefix stripped first so prefixes
 * never stack. `null` when unknown, already marked, or nothing is left.
 *
 * A topic that is only a trigger word ("batch", "/do-batch", "sammelmodus" …)
 * becomes `Feedback zu <Projekt>` / `Feedback on <project>` (batch-topic.js);
 * the topic is clamped to the title budget (title-budget.js).
 *
 * @param {string|null} current
 * @param {{ lang?: string, cwd?: string }} [ctx] locale (default de) and project dir
 * @returns {string|null}
 */
function batchTitle(current, ctx = {}) {
  if (typeof current !== 'string' || !current.trim()) return null;
  const r = rest(current);
  if (!r) return null;
  const next = carrySubMark(current, BATCH_PREFIX + clampTopic(batchTopic(r.trim(), ctx), headWidth(BATCH_PREFIX)));
  return next !== current ? next : null;
}

/**
 * The title retiring /do-batch leaves (merge.md § Retire): exactly the
 * leading batch prefix removed (`👉 ➜ 📚 `, or the legacy
 * `📥 Batch – `). `null` when the title does not carry it — a title the
 * user renamed meanwhile wins — or nothing would be left.
 *
 * A remaining topic that is only a trigger word ("batch") becomes the
 * `Feedback zu <Projekt>` fallback instead (batch-topic.js).
 *
 * @param {string|null} current
 * @param {{ lang?: string, cwd?: string }} [ctx]
 * @returns {string|null}
 */
function unbatchTitle(current, ctx = {}) {
  if (typeof current !== 'string' || classify(current) !== 'batch') return null;
  const r = current.slice(leadingPrefix(current).length);
  return r.trim() ? batchTopic(r.trim(), ctx) : null;
}

/**
 * The title firing a batch (`go` / `/do-batch go`) leaves: the merge and
 * hand-off turn is real work, so the batch prefix gives way to the work
 * prefix (`⏳ ➜ 🤖 <topic>`), not to the bare topic. Plain
 * deactivation keeps unbatchTitle. `null` when the title carries no batch
 * prefix or nothing would be left.
 *
 * @param {string|null} current
 * @param {{ lang?: string, cwd?: string }} [ctx]
 * @returns {string|null}
 */
function fireTitle(current, ctx = {}) {
  const topic = unbatchTitle(current, ctx);
  return topic ? clampTitle(carrySubMark(current, WORK_PREFIX + topic)) : null;
}

/**
 * F5: the title a turn that ended WITHOUT a completion card leaves. Only a
 * bare `⏳ ` (generic work, or the legacy `⏳ Working – `) becomes
 * `👉 ➜ ⚡ <title>`; a batch, a waiting concept, a running ship
 * and every other named state stay (`null`).
 *
 * @param {string|null} current
 * @returns {string|null}
 */
function interruptedTitle(current) {
  if (typeof current !== 'string' || classify(current) !== 'work') return null;
  const r = rest(current);
  return r ? clampTitle(carrySubMark(current, INTERRUPTED_PREFIX + r)) : null;
}

/**
 * #833: the title a card-less NOTIFICATION turn leaves once no background
 * work of the session is live. A title that still says ⏳ (bare work, a
 * running ship, Team, Testing) — or a 👉 approval head, whose agent is gone
 * too — is replaced by `terminalPrefix` (the last
 * delegated-ship result's `titlePrefix`, see `lastTitlePrefix`) or, without
 * one, by `👉 ➜ ⚡ `. A working concept page, a batch and every
 * non-⏳ state stay (`null`). The caller proves "no live work".
 *
 * @param {string|null} current
 * @param {string|null} [terminalPrefix]
 * @returns {string|null}
 */
function staleWorkTitle(current, terminalPrefix = null) {
  if (typeof current !== 'string') return null;
  const kind = classify(current);
  if (kind !== 'work' && kind !== 'shipping' && kind !== 'process' && kind !== 'approval') return null;
  if ((hasSubMark(current) ? current.slice(SUB_LEN) : current).startsWith(CONCEPT_WORKING_PREFIX)) return null;
  const r = rest(current);
  return r ? clampTitle(carrySubMark(current, (terminalPrefix || INTERRUPTED_PREFIX) + r)) : null;
}

/**
 * #833: the last `titlePrefix` a delegated ship returned in `text` (a
 * transcript slice), when it is a settled state — never an ⏳ one. `null`
 * when there is none.
 *
 * @param {string} text
 * @returns {string|null}
 */
function lastTitlePrefix(text) {
  if (typeof text !== 'string' || !text.includes('titlePrefix')) return null;
  const re = /titlePrefix\\*"\s*:\s*\\*"([^"\\]+)/g;
  let m; let last = null;
  while ((m = re.exec(text)) !== null) last = m[1];
  if (!last || !last.trim()) return null;
  const kind = classify(last + 'x');
  return kind === 'plain' || kind === 'work' || kind === 'process' || kind === 'shipping' ? null : last;
}

/**
 * #1156: the prefix of the newest SETTLED title in `text` (a transcript
 * slice) — a `custom-title` entry whose head is an outcome (`👉 ➜ 🚀 `,
 * `🟩 …`), never ⏳ work, a running process, a batch, a concept
 * page or an open ❓ question. `null` when the slice holds none. The prefix is
 * cut from the title itself, so an older grammar comes back as it was.
 *
 * @param {string} text
 * @returns {string|null}
 */
function lastSettledTitlePrefix(text) {
  if (typeof text !== 'string' || !text.includes('custom-title')) return null;
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = titleOf(lines[i], 'custom-title', 'customTitle');
    if (t === undefined || classify(t) !== 'outcome') continue;
    const lead = leadingPrefix(t);
    if (!lead) continue;
    const prefix = t.slice(0, lead.length);
    if (prefix.includes('❓')) continue;
    return prefix;
  }
  return null;
}

/** The title an entry line carries, or undefined when it is no title entry. */
function titleOf(line, type, key) {
  if (!line.includes(`"type":"${type}"`)) return undefined;
  try {
    const o = JSON.parse(line);
    return o && o.type === type && typeof o[key] === 'string' ? o[key] : undefined;
  } catch { return undefined; }
}

/**
 * The session's current title from the transcript tail: the last
 * `custom-title` entry, else the last `agent-name` entry, else `null`
 * (unknown). Reads 64 KB from the end and doubles up to `maxBytes`; never
 * throws.
 *
 * @param {string|undefined} transcriptPath hook input `transcript_path`
 * @param {{ maxBytes?: number, chunk?: number }} [opts]
 * @returns {string|null}
 */
function readCurrentTitle(transcriptPath, { maxBytes = 4 * 1024 * 1024, chunk = 64 * 1024 } = {}) {
  if (!transcriptPath) return null;
  let fd;
  try {
    fd = fs.openSync(transcriptPath, 'r');
    const size = fs.fstatSync(fd).size;
    let span = Math.min(size, chunk);
    for (;;) {
      const start = size - span;
      const buf = Buffer.alloc(span);
      fs.readSync(fd, buf, 0, span, start);
      // Drop the partial first line (also keeps a UTF-8 sequence whole).
      const from = start > 0 ? buf.indexOf(0x0a) + 1 : 0;
      const lines = from > 0 || start === 0 ? buf.subarray(from).toString('utf8').split('\n') : [];
      let agent;
      for (let i = lines.length - 1; i >= 0; i--) {
        const custom = titleOf(lines[i], 'custom-title', 'customTitle');
        if (custom !== undefined) return custom;
        if (agent === undefined) agent = titleOf(lines[i], 'agent-name', 'agentName');
      }
      if (start === 0 || span >= maxBytes) return agent !== undefined ? agent : null;
      span = Math.min(size, maxBytes, span * 2);
    }
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

/**
 * The Desktop app's title sidecar next to the transcript
 * (`<projects>/<slug>/<sessionId>/custom-title.json`, `{"customTitle": …}` —
 * the same file lib/stale-titles.js reads), or null. It can exist before the
 * transcript carries any `custom-title` entry (a session's first prompt).
 *
 * @param {string|undefined} transcriptPath hook input `transcript_path`
 * @returns {string|null}
 */
function readSidecarTitle(transcriptPath) {
  if (!transcriptPath || !/\.jsonl$/.test(transcriptPath)) return null;
  try {
    const file = path.join(transcriptPath.replace(/\.jsonl$/, ''), 'custom-title.json');
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    return o && typeof o.customTitle === 'string' ? o.customTitle : null;
  } catch {
    return null;
  }
}

/** The title from the transcript tail, else from the app's sidecar, else null. */
function readKnownTitle(transcriptPath) {
  const t = readCurrentTitle(transcriptPath);
  return t !== null ? t : readSidecarTitle(transcriptPath);
}

/**
 * True when the transcript shows no earlier user prompt than the current one
 * (a path whose file is missing, or at most one prompt entry in a small
 * file): such a session's
 * title can only be the app's own summary — no state prefix to strip yet.
 *
 * @param {string|undefined} transcriptPath
 * @param {number} [maxBytes] larger files count as "not fresh"
 */
function isFreshSession(transcriptPath, maxBytes = 256 * 1024) {
  if (!transcriptPath) return false; // no transcript at all: nothing is known
  let text;
  try {
    if (fs.statSync(transcriptPath).size > maxBytes) return false;
    text = fs.readFileSync(transcriptPath, 'utf8');
  } catch { return true; }
  let prompts = 0;
  for (const line of text.split('\n')) {
    if (!line.includes('"type":"user"')) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (!e || e.type !== 'user' || e.isMeta === true || e.isSidechain) continue;
    const c = e.message && e.message.content;
    const prompt = typeof c === 'string' || (Array.isArray(c) && c.some((b) => b && b.type !== 'tool_result'));
    if (prompt && ++prompts > 1) return false;
  }
  return true;
}

/** Claude Code's project-dir name for `cwd`: every non-alphanumeric char
 *  becomes '-' (`C:\a\.b` → `C---a--b`). */
function projectSlug(cwd) {
  return String(cwd ?? '').replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * The session transcript `~/.claude/projects/<slug>/<sessionId>.jsonl`, or
 * null. `cwd` given → its slug dir first (one stat); otherwise, or when the
 * session started in another dir, one readdir over the project dirs. Callers
 * without a hook `transcript_path` (mcp-server, card-pregate) resolve it here.
 *
 * @param {string|undefined} sessionId
 * @param {string} [home] defaults to os.homedir()
 * @param {string} [cwd]
 * @returns {string|null}
 */
function findTranscript(sessionId, home = os.homedir(), cwd = undefined) {
  if (!sessionId || !/^[\w-]+$/.test(sessionId)) return null;
  const root = path.join(home, '.claude', 'projects');
  const file = `${sessionId}.jsonl`;
  if (cwd) {
    const p = path.join(root, projectSlug(cwd), file);
    if (fs.existsSync(p)) return p;
  }
  let dirs;
  try { dirs = fs.readdirSync(root); } catch { return null; }
  for (const d of dirs) {
    const p = path.join(root, d, file);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

module.exports = {
  readSidecarTitle,
  readKnownTitle,
  isFreshSession,
  staleWorkTitle,
  lastTitlePrefix,
  lastSettledTitlePrefix,
  projectSlug,
  findTranscript,
  WORK_PREFIX,
  LEGACY_PENDING_PREFIX,
  LEGACY_PREFIXES,
  SHIPPING_PREFIX,
  CONCEPT_PREFIX,
  CONCEPT_WORKING_PREFIX,
  BATCH_PREFIX,
  INTERRUPTED_PREFIX,
  classify,
  stripPrefixes,
  nextTitle,
  batchTitle,
  unbatchTitle,
  fireTitle,
  interruptedTitle,
  readCurrentTitle,
};
