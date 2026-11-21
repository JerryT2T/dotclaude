#!/usr/bin/env node
/**
 * @hook substop.agent.report
 * @version 0.1.0
 * @event SubagentStop
 * @plugin devops
 * @description A devops agent (`agent_type` devops:*) that stops with a last
 *   assistant text of fewer than 30 words gets sent back once: the caller only
 *   receives that last message, so a status line ("Done.", "Waiting for the
 *   background task") loses the whole report. Blocks ONCE — never when
 *   `stop_hook_active` is set or the transcript already carries this hook's
 *   marker. Fail open on any error, a missing/unreadable transcript, an
 *   unknown agent type or a transcript without an assistant message.
 */

require('../lib/plugin-guard');

const fs = require('fs');

const MARKER = '[agent-report]';
const MIN_WORDS = 30;
const TAIL_BYTES = 262144;

function readTail(file) {
  let fd;
  try {
    const size = fs.statSync(file).size;
    const start = Math.max(0, size - TAIL_BYTES);
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    return buf.toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* nothing to release */ }
  }
}

function wordCount(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

/** Text of the last assistant entry in a transcript tail; null when none can be read. */
function lastAssistantText(tail) {
  const lines = String(tail || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].trim()) continue;
    let e;
    try { e = JSON.parse(lines[i]); } catch { continue; } // a cut first line is skipped
    if (!e || e.type !== 'assistant') continue;
    const c = e.message && e.message.content;
    if (typeof c === 'string') return c;
    if (!Array.isArray(c)) continue;
    // One message may be written as several entries (one per block): a final
    // text block sits in the last entry; a tool-only entry means no text yet.
    return c.filter(b => b && b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('\n');
  }
  return null;
}

function reason(words) {
  return (
    `${MARKER} Your last message has ${words} word${words === 1 ? '' : 's'} — the caller receives ONLY that last message. ` +
    'Write your final report now as your last message: the verdict first, then the evidence (file:line), within the ' +
    'length you were given. Not a status line, not a reply to a background notification.'
  );
}

function main(hook) {
  if (!hook || hook.stop_hook_active) return null; // never loop, never block twice
  if (!/^devops:/.test(String(hook.agent_type || ''))) return null;
  let text = typeof hook.last_assistant_message === 'string' ? hook.last_assistant_message : null;
  const tail = hook.agent_transcript_path || hook.transcript_path
    ? readTail(hook.agent_transcript_path || hook.transcript_path)
    : '';
  if (tail.includes(MARKER)) return null; // already sent back once
  if (text === null) text = lastAssistantText(tail);
  if (text === null) return null; // nothing readable → fail open
  const words = wordCount(text);
  if (words >= MIN_WORDS) return null;
  return JSON.stringify({ decision: 'block', reason: reason(words) });
}

if (require.main === module) {
  try {
    require('../lib/hook-input').runHook(main, { event: 'SubagentStop' });
  } catch {
    // fail open
  }
}

module.exports = { main, wordCount, lastAssistantText, MARKER, MIN_WORDS };
