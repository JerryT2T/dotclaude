#!/usr/bin/env node
/**
 * @script concept-coverage
 * @version 0.1.0
 * @plugin devops
 * @description Post-round coverage for a concept round (auto-concept Step 5c).
 *   Turns the submitted payload into a checklist the session fills with
 *   evidence before it reloads the page, and flags remarks the user already
 *   made in an earlier round.
 *
 *   Input: the submitted payload (a file, or `-` for stdin) and the concept
 *   source folder docs/concepts/{name}/. Earlier rounds come from the sibling
 *   docs/concepts/{name}-decisions.json (Step 5e), entries whose `iteration`
 *   is lower than the payload's.
 *
 *   Output:
 *     docs/concepts/{name}/checks/NN.md   one checklist line per user remark
 *                                         (general / item / design / screen /
 *                                         view comment, decision note, pin,
 *                                         annotation answer) with the state
 *                                         it lives in and an empty evidence slot
 *     stdout                              CHECK lines, REPEAT lines, a summary
 *
 *     CHECK  <id> <state> [pattern…] — <text>
 *     REPEAT <id> ~ round <N> <id>
 *
 *   States (keyword-based, German + English cues): rest | hover | focus |
 *   scroll | cursor | animation. A remark with no cue is `rest`. Patterns name
 *   the known miss classes (fab-overlap, label-vs-input, single-line, cursor)
 *   so the session checks the right element in the right state.
 *
 *   Usage:
 *     concept-coverage.js --payload <file|-> --dir <docs/concepts/{name}>
 *                         [--decisions <file>] [--round N] [--no-write]
 *
 *   Exit codes: 0 ok (with or without REPEAT lines), 2 usage / unreadable input.
 */

const fs = require('fs');
const path = require('path');

/** Lowercase, fold umlauts and ß, keep letters and digits only. */
function normalise(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9☰💬]+/gu, ' ')
    .trim();
}

// Function words and praise: they carry no subject, so two remarks that share
// only these are not the same remark ("super!" vs "perfekt!").
const STOP = new Set((
  'der die das den dem des ein eine einen einem einer eines und oder aber auch noch nur schon mal ' +
  'ist sind war waere wird werden sein soll sollte sollten muss kann koennte bitte gern gerne ' +
  'ich du er sie es wir ihr man mich mir dir uns hier da dort dann denn doch ja nein ne nicht nix ' +
  'mit von zu zum zur bei fuer auf aus an am im in ins um ueber unter vor nach als wie wenn weil ' +
  'dass ob so sehr viel mehr eher etwas immer einfach ganz gar halt wobei also vllt ggf bzw ' +
  'super perfekt gut top klasse toll schoen prima genau richtig idee finde klingt sieht passt ' +
  'the a an and or but also only just is are was be should must can could please ' +
  'i you we it me my this that these there then when if as of to in on at for with ' +
  'great perfect good nice fine yes no not very more'
).split(' '));

/** Content stems: stopwords out, first 5 letters in (typo- and inflection-tolerant). */
function stems(text) {
  const out = new Set();
  for (const w of normalise(text).split(' ')) {
    if (w.length < 3 || STOP.has(w)) continue;
    out.add(w.slice(0, 5));
  }
  return out;
}

const STATE_CUES = [
  ['hover', /hover|drueber|darueber|mouseover|mit der maus/],
  ['focus', /fokus|focus|tastatur|keyboard|tab taste/],
  ['scroll', /scroll|blaetter/],
  ['cursor', /cursor|mauszeiger|zeiger|pointer/],
  ['animation', /anim|transition|uebergang|einblend|ausblend|nacheinander|reinfahr/],
];

const PATTERN_CUES = [
  ['fab-overlap', /ueberlapp|overlap|kollid|fab|schnellnavigation|☰|💬/],
  ['label-vs-input', /label|platzhalter|placeholder|hinweis.*(input|feld)|(input|feld).*hinweis/],
  ['single-line', /einzeilig|eine zeile|single line|one line|ein zeile|inline/],
  ['cursor', /cursor|mauszeiger/],
];

function cues(table, text) {
  const n = normalise(text);
  return table.filter(([, re]) => re.test(n)).map(([k]) => k);
}

function guessState(text) {
  const s = cues(STATE_CUES, text);
  return s.length ? s : ['rest'];
}

const asText = (v) => (typeof v === 'string' ? v : v && (v.text || v.note || v.answer)) || '';

/** Every user remark in one payload, deduplicated by text: [{ id, kind, text, anchor }]. */
function remarks(payload) {
  const out = [];
  const seen = new Set();
  const add = (id, kind, text, anchor) => {
    const key = normalise(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ id, kind, text: String(text).trim(), anchor: anchor || '' });
  };
  const c = payload.comments || {};
  add('general', 'general', asText(c.general));
  for (const a of payload.annotations || []) add(a.id, 'annotation', a.answer, a.screen);
  for (const i of c.items || []) add(i.id, 'comment', asText(i));
  for (const kind of ['designs', 'screens', 'views']) {
    for (const [id, v] of Object.entries(c[kind] || {})) add(id, kind.slice(0, -1), asText(v), id);
  }
  for (const p of payload.userPins || []) add(p.id, 'pin', asText(p), p.target || p.screen);
  for (const d of payload.decisions || []) if (d.note) add(d.id, 'note', d.note, d.id);
  return out;
}

/**
 * Is `cur` the same remark as `prev`? Overlap of content stems relative to the
 * shorter remark, plus shared state / pattern cues as anchors. A remark with
 * fewer than three content stems (praise, "ja so") never counts.
 */
function similarity(cur, prev) {
  const a = stems(cur.text);
  const b = stems(prev.text);
  if (a.size < 3 || b.size < 3) return 0;
  let shared = 0;
  for (const s of a) if (b.has(s)) shared++;
  const jaccard = shared / (a.size + b.size - shared);
  const overlap = shared / Math.min(a.size, b.size);
  const anchorsA = new Set([...cues(STATE_CUES, cur.text), ...cues(PATTERN_CUES, cur.text)]);
  let anchors = 0;
  for (const k of new Set([...cues(STATE_CUES, prev.text), ...cues(PATTERN_CUES, prev.text)])) if (anchorsA.has(k)) anchors++;
  if (cur.anchor && prev.anchor && normalise(cur.anchor) === normalise(prev.anchor)) anchors++;
  if (shared < 2 || anchors < 1) return 0;
  return Math.max(jaccard, overlap * 0.5) + 0.15 * anchors;
}

const REPEAT_THRESHOLD = 0.38;

/** REPEAT findings: for each current remark, the best earlier match above the threshold. */
function findRepeats(current, earlierRounds) {
  const out = [];
  for (const cur of current) {
    let best = null;
    for (const r of earlierRounds) {
      for (const prev of remarks(r)) {
        const score = similarity(cur, prev);
        if (score >= REPEAT_THRESHOLD && (!best || score > best.score)) best = { id: cur.id, round: r.iteration, prevId: prev.id, score };
      }
    }
    if (best) out.push(best);
  }
  return out;
}

const pad = (n) => String(n).padStart(2, '0');
const oneLine = (t, max = 160) => {
  const s = String(t).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

function checklist(round, items, repeats) {
  const rep = new Map(repeats.map((r) => [r.id, r]));
  const lines = [
    `# Round ${pad(round)} — coverage`,
    '',
    'One line per remark. Before `/reload`, fill every evidence slot with a tool',
    'result from this session that shows the element in the named state.',
    '',
  ];
  for (const it of items) {
    const tags = [...it.state, ...it.patterns].join(', ');
    const r = rep.get(it.id);
    lines.push(`- [ ] \`${it.id}\` (${it.kind}; ${tags})${r ? ` REPEAT of round ${r.round} \`${r.prevId}\`` : ''}`);
    lines.push(`  > ${oneLine(it.text, 400)}`);
    lines.push('  - evidence: ');
  }
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const opts = { write: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--payload') opts.payload = argv[++i];
    else if (a === '--dir') opts.dir = argv[++i];
    else if (a === '--decisions') opts.decisions = argv[++i];
    else if (a === '--round') opts.round = Number(argv[++i]);
    else if (a === '--no-write') opts.write = false;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!opts.payload || !opts.dir) throw new Error('usage: concept-coverage.js --payload <file|-> --dir <docs/concepts/{name}> [--decisions <file>] [--round N] [--no-write]');
  return opts;
}

function readJson(file) {
  return JSON.parse(file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8'));
}

/** The whole run as a pure-ish function: returns { round, items, repeats, file, stdout }. */
function run(opts) {
  const payload = readJson(opts.payload);
  const round = opts.round || payload.iteration;
  if (!Number.isInteger(round) || round < 1) throw new Error('payload has no iteration; pass --round N');
  const dir = path.resolve(opts.dir);
  const decisionsFile = opts.decisions || `${dir.replace(/[\\/]+$/, '')}-decisions.json`;
  let history = [];
  if (fs.existsSync(decisionsFile)) {
    const d = readJson(decisionsFile);
    history = (Array.isArray(d) ? d : d.iterations || []).filter((r) => Number(r.iteration) < round);
  }
  const items = remarks(payload).map((r) => ({ ...r, state: guessState(r.text), patterns: cues(PATTERN_CUES, r.text) }));
  const repeats = findRepeats(items, history);
  const file = path.join(dir, 'checks', `${pad(round)}.md`);
  if (opts.write) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, checklist(round, items, repeats));
  }
  const out = [];
  for (const it of items) out.push(`CHECK ${it.id} ${it.state.join('+')}${it.patterns.length ? ` [${it.patterns.join(',')}]` : ''} — ${oneLine(it.text, 100)}`);
  for (const r of repeats) out.push(`REPEAT ${r.id} ~ round ${r.round} ${r.prevId}`);
  const nonRest = items.filter((i) => i.state[0] !== 'rest').length;
  out.push(`coverage: ${items.length} remarks, ${nonRest} beyond rest state, ${repeats.length} repeats${opts.write ? ` → ${path.relative(process.cwd(), file) || file}` : ''}`);
  return { round, items, repeats, file, stdout: `${out.join('\n')}\n` };
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
    process.stdout.write(run(opts).stdout);
    return 0;
  } catch (e) {
    process.stderr.write(`concept-coverage: ${e.message}\n`);
    return 2;
  }
}

module.exports = { normalise, stems, guessState, cues, remarks, similarity, findRepeats, checklist, run, main, STATE_CUES, PATTERN_CUES, REPEAT_THRESHOLD };

if (require.main === module) process.exit(main(process.argv.slice(2)));
