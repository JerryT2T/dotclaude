'use strict';
/**
 * @module wait-loop-match
 * @version 0.1.0
 * @plugin devops
 * @description Pure matcher for pre.waitloop.guard. Finds POSIX `until` / `while`
 *   loops that wait on something with no bound, or spin with no sleep.
 *
 *   Incident (2026-11-05): 9 wait loops from Claude sessions had polled /tmp logs
 *   that never changed for 3 to 3.5 hours, one of them with no sleep at over a
 *   quarter of a core. Only a reboot ended them. The Bash tool's own timeout does
 *   not bound them either: it moves the call to the background instead of killing it.
 *
 *   Verdict per loop, first match wins:
 *     1. input-driven (`read`, `mapfile`, `getopts`, `$#`, `shift`) → fine
 *     2. counter bound: a compared variable the loop itself changes → fine
 *     3. idle body (only `:`, `echo`, read-only probes) with no sleep → `busy`,
 *        even under a deadline or `timeout`: it spins a core until the bound hits
 *     4. deadline (`$SECONDS`, `date +%s`, `deadline` in a comparison) or a
 *        `timeout N bash -c '…'` wrapper → fine
 *     5. constant condition (`while true`) or a `sleep` → `unbounded`
 *     6. anything else is an ordinary loop doing work → fine
 *   A timeout on the probe (`until timeout 5 curl x`) bounds one attempt, not the
 *   loop. `bash -c` / `eval` bodies and heredocs fed to a shell count as commands;
 *   other quoted text, comments and data heredocs do not.
 */

const { prepare } = require('./crawl-guard-match');

const BYPASS = /\bDEVOPS_ALLOW_UNBOUNDED_LOOP=1\b/;
const KEYWORD = /\b(?:while|until|for|select|do|done)\b/g;
const BEFORE_COMMAND = new Set(['then', 'do', 'else', 'elif', 'if', 'while', 'until', 'time', '!']);
const SEPARATORS = ';&|({)}`\n';
const IDLE = new Set([':', 'true', 'false', 'echo', 'printf', 'sleep', 'usleep', 'date', 'clear', 'ls', 'cat', 'tail', 'head', 'wc', 'ps', 'pgrep', 'stat', 'du', 'df', 'jobs', 'grep', 'egrep', 'fgrep', 'test', '[', '[[', 'break', 'continue', 'tasklist']);
const INPUT_CMD = /(?:^|[;&|(!\n]|\b(?:then|do|else|elif|if)\b)\s*(?:[A-Za-z_]\w*=\S*\s+)*(?:read|readarray|mapfile|getopts)\b/;
const SLEEP = /(?:^|[\s;&|(`])(?:sleep|usleep)\b/;
const COMPARE = /-(?:lt|le|gt|ge|eq|ne)\b|\(\(.*[<>=]|\[\[.*[<>]/;
const TIME_REF = /\b(?:EPOCH)?SECONDS\b|\bdate\s+(?:-u\s+)?["']?\+%s|\bdeadline\b/i;
const EXIT = /\b(?:break|exit|return)\b/;
const SHELL_C = /(?:^|[\s;&|(`])(?:(?:[\w.:-]*[\\/])*(?:ba|z|da|k)?sh(?:\.exe)?\s+(?:-[a-z]+\s+)*-[a-z]*c|eval)\s+(['"])/g;
const HEREDOC_UNDER_TIMEOUT = /(?:^|[\s;&|(])g?timeout\s[^\n;|&]*\b(?:ba|z|da|k)?sh\b[^\n]*<</;

/**
 * Same-length copies of `src`: `raw` without comments, `mask` also with quoted
 * text replaced by `_` (the quote characters stay, so `bash -c '…'` is findable).
 */
function maskShell(src) {
  const raw = src.split('');
  const mask = src.split('');
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\' && quote === '"' && i + 1 < src.length) { mask[i] = '_'; mask[++i] = '_'; continue; }
      if (ch === quote) { quote = null; continue; }
      mask[i] = '_';
      continue;
    }
    if (ch === '\\') { i++; if (i < src.length) mask[i] = '_'; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '#' && (i === 0 || /[\s;&|(]/.test(src[i - 1]))) {
      for (; i < src.length && src[i] !== '\n'; i++) { raw[i] = ' '; mask[i] = ' '; }
    }
  }
  return { raw: raw.join(''), mask: mask.join('') };
}

function atCommandPosition(mask, at) {
  let i = at - 1;
  while (i >= 0 && (mask[i] === ' ' || mask[i] === '\t' || mask[i] === '\r')) i--;
  if (i < 0 || SEPARATORS.includes(mask[i])) return true;
  let j = i;
  while (j >= 0 && !/\s/.test(mask[j])) j--;
  return BEFORE_COMMAND.has(mask.slice(j + 1, i + 1)) && atCommandPosition(mask, j + 1);
}

/** Every complete while/until loop in `mask`: keyword, `do` and `done` offsets. */
function findLoops(mask) {
  const loops = [];
  const stack = [];
  const re = new RegExp(KEYWORD);
  let m;
  while ((m = re.exec(mask))) {
    if (!atCommandPosition(mask, m.index)) continue;
    const word = m[0];
    if (word === 'do') {
      const top = stack[stack.length - 1];
      if (top && top.doAt < 0) top.doAt = m.index;
    } else if (word === 'done') {
      const top = stack.pop();
      if (top && top.doAt >= 0 && (top.word === 'while' || top.word === 'until')) loops.push({ ...top, doneAt: m.index });
    } else {
      stack.push({ word, at: m.index, doAt: -1 });
    }
  }
  return loops;
}

/** The first word of each simple command in a masked body, keywords stripped. */
function commandWords(maskBody) {
  const words = [];
  for (const part of maskBody.split(/[;&|\n]+/)) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    while (tokens.length && /^(?:if|then|else|elif|fi|do|done|!|\{|\}|\(|\)|time)$/.test(tokens[0])) tokens.shift();
    if (tokens.length) words.push(tokens[0]);
  }
  return words;
}

function isIdleBody(maskBody) {
  return commandWords(maskBody).every((w) => {
    if (/^[A-Za-z_]\w*\+?=/.test(w)) return false;
    return IDLE.has(w.split(/[\\/]/).pop().replace(/\.exe$/i, ''));
  });
}

function isConstantCondition(word, maskCond) {
  const c = maskCond.replace(/[;\s]+$/, '').trim();
  const alwaysTrue = /^(?:true|:|(?:\/usr)?\/bin\/true|\[\s*1\s*\]|\[\[\s*1\s*\]\]|\(\(\s*1\s*\)\)|\[\s*(\S+)\s*(?:==?|-eq)\s*\1\s*\])$/.test(c);
  const alwaysFalse = /^(?:false|(?:\/usr)?\/bin\/false|!\s*true|!\s*:|\(\(\s*0\s*\)\))$/.test(c);
  return word === 'while' ? alwaysTrue : alwaysFalse;
}

function segments(text) {
  return text.split(/;|&&|\|\||\n/);
}

/** Variables the loop changes with arithmetic on themselves. */
function modifiedVars(text) {
  const vars = new Set();
  const patterns = [
    /\(\(\s*\$?([A-Za-z_]\w*)\s*(?:\+\+|--|[+\-*/]=)/g,
    /\(\(\s*(?:\+\+|--)\s*([A-Za-z_]\w*)/g,
    /\blet\s+["']?([A-Za-z_]\w*)/g,
    /\b([A-Za-z_]\w*)\+=/g,
    /\b([A-Za-z_]\w*)=["']?\$\(\([^\n]*?\b\1\b/g,
    /\b([A-Za-z_]\w*)=["']?\$\[[^\n]*?\b\1\b/g,
    /\b([A-Za-z_]\w*)=["']?\$\(expr\s[^\n]*?\b\1\b/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) vars.add(m[1]);
  }
  return vars;
}

function comparedVars(segment) {
  const vars = new Set();
  let m;
  const dollar = /\$\{?([A-Za-z_]\w*)/g;
  while ((m = dollar.exec(segment))) vars.add(m[1]);
  const arith = /\(\((.*)\)\)/.exec(segment);
  if (arith) {
    const bare = /\b([A-Za-z_]\w*)\b/g;
    while ((m = bare.exec(arith[1]))) vars.add(m[1]);
  }
  return vars;
}

/**
 * Does a comparison on a changing counter (or, with `time`, on the clock) end the
 * loop? A comparison in the condition does; one in the body needs a break/exit.
 */
function boundedBy(cond, body, maskBody, kind) {
  const text = `${cond}\n${body}`;
  const tainted = new Set();
  const isTime = (seg) => TIME_REF.test(seg) || [...comparedVars(seg)].some((v) => tainted.has(v));
  if (kind === 'time') {
    for (const seg of segments(text)) {
      const a = /^\s*(?:local\s+)?([A-Za-z_]\w*)=(.*)$/.exec(seg);
      if (a && isTime(a[2])) tainted.add(a[1]);
    }
  }
  const moved = kind === 'counter' ? modifiedVars(text) : null;
  const hits = (seg) => COMPARE.test(seg) && (kind === 'time' ? isTime(seg) : [...comparedVars(seg)].some((v) => moved.has(v)));
  if (segments(cond).some(hits)) return true;
  return EXIT.test(maskBody) && segments(body).some(hits);
}

/** The mask of the loop's body with nested while/until loops blanked. */
function withoutNested(mask, loop, loops) {
  const start = loop.doAt + 2;
  let out = mask.slice(start, loop.doneAt);
  for (const inner of loops) {
    if (inner === loop || inner.at <= loop.doAt || inner.doneAt >= loop.doneAt) continue;
    const from = inner.at - start;
    const len = inner.doneAt + 4 - inner.at;
    out = out.slice(0, from) + ' '.repeat(len) + out.slice(from + len);
  }
  return out;
}

/** @returns {'busy'|'unbounded'|null} */
function classifyLoop(loop, loops, raw, mask, wrapped) {
  const condStart = loop.at + loop.word.length;
  const cond = raw.slice(condStart, loop.doAt);
  const body = raw.slice(loop.doAt + 2, loop.doneAt);
  const maskCond = mask.slice(condStart, loop.doAt);
  const maskBody = mask.slice(loop.doAt + 2, loop.doneAt);
  const ownBody = withoutNested(mask, loop, loops);
  if (INPUT_CMD.test(maskCond.trimStart()) || INPUT_CMD.test(ownBody.trimStart()) || /\$#/.test(cond) || /(?:^|[\s;&|])shift\b/.test(ownBody)) return null;
  if (boundedBy(cond, body, maskBody, 'counter')) return null;
  const sleeps = SLEEP.test(maskCond) || SLEEP.test(maskBody);
  if (!sleeps && isIdleBody(maskBody)) return 'busy';
  if (wrapped || boundedBy(cond, body, maskBody, 'time')) return null;
  return sleeps || isConstantCondition(loop.word, maskCond) ? 'unbounded' : null;
}

/** The text of the simple command that ends at `end`. */
function headOf(mask, end) {
  let i = end - 1;
  while (i >= 0 && !';&|\n('.includes(mask[i])) i--;
  return mask.slice(i + 1, end);
}

function scan(text, wrapped, found, depth) {
  const { raw, mask } = maskShell(text);
  const loops = findLoops(mask);
  for (const loop of loops) {
    const kind = classifyLoop(loop, loops, raw, mask, wrapped);
    if (kind) found.push({ kind, loop: raw.slice(loop.at, loop.doneAt + 4).replace(/\s+/g, ' ').trim() });
  }
  if (depth >= 3) return;
  const re = new RegExp(SHELL_C);
  let m;
  while ((m = re.exec(mask))) {
    const quote = m[1];
    const open = m.index + m[0].length - 1;
    const close = mask.indexOf(quote, open + 1);
    if (close < 0) continue;
    let inner = raw.slice(open + 1, close);
    if (quote === '"') inner = inner.replace(/\\(["$`\\])/g, '$1');
    const under = wrapped || /(?:^|[\s\\/])g?timeout(?:\.exe)?\s/.test(headOf(mask, open));
    scan(inner, under, found, depth + 1);
  }
}

/**
 * @param {string} command a Bash tool command
 * @returns {Array<{kind:'busy'|'unbounded', loop:string}>} offending loops
 */
function findWaitLoops(command) {
  const src = String(command || '');
  const bodies = [];
  const found = [];
  scan(prepare(src, 'bash', bodies), false, found, 0);
  const under = HEREDOC_UNDER_TIMEOUT.test(src);
  for (const b of bodies) if (b.shell === 'bash') scan(b.text, under, found, 1);
  return found;
}

function hasBypass(command) {
  return BYPASS.test(String(command || ''));
}

module.exports = { findWaitLoops, hasBypass };
