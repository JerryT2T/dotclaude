/**
 * @module side-sessions
 * @version 0.1.0
 * @description Side-session notes and linked side-session work.
 *
 *   A Desktop session can start another one (`mcp__ccd_session__start_session`)
 *   and is told when that session finished a turn: either a user-role message
 *   `<side-sessions-event>…` or a `<system-reminder>` note
 *   `The session "<title>" you started (local_<uuid>) finished a turn[ (PR #n)]. It reported (…): "…"`.
 *
 *   1. MACHINE TURN. A prompt that consists ONLY of such notes (plus other
 *      system-reminders) is nobody's typing: SIDE_SESSION_TURN_PATTERN. A typed
 *      prompt that merely carries an attached note stays a user turn.
 *   2. OPEN WORK. A start_session whose brief carries `[devops:handoff]` or
 *      `[devops:deliver]` and whose result says `Started session "…" (session_id: local_…`
 *      is OPEN linked work until a later note for that id reports a finished turn
 *      that is done. Unmarked sessions are independent follow-ups: never work.
 *      Linked work is its own class (kind 'session'), NOT part of scanOpenTasks —
 *      the card surfaces it through its `linked` field, never through `pending`.
 *
 *   Done-vs-waiting is no structured field. Heuristic (best effort, small, a
 *   guess must never block): a finished-turn note closes the session unless its
 *   quoted report ends in a question mark or says it waits for / asks the user
 *   (WAITING_RE) — then the session stays open, state 'waiting'.
 */

const fs = require('fs');

const START_TOOL = 'mcp__ccd_session__start_session';
const MARKER_RE = /\[devops:(handoff|deliver)\]/;
const STARTED_RE = /Started session "([^"\n]*)" \(session_id: (local_[\w-]+)/;
/** One finished-turn note; the quoted report follows up to the next note/reminder end. */
const NOTE_RE = /The session "([^"\n]*)" you started \((local_[\w-]+)\) finished a turn(?: \(PR #\d+\))?\./g;
const EVENT_ID_RE = /local_[\w-]+/;

const SR = '<system-reminder>(?:(?!</system-reminder>)[\\s\\S])*(?:</system-reminder>|$)';
const EV = '<side-sessions-event\\b(?:(?!</side-sessions-event>)[\\s\\S])*(?:</side-sessions-event>|$)';
/** The whole prompt = reminder/event blocks only, at least one of them a side-session note. */
const SIDE_SESSION_TURN_PATTERN = new RegExp(
  '^(?=[\\s\\S]*(?:<side-sessions-event|The session "[^"\\n]*" you started \\(local_[\\w-]+\\) finished a turn))'
  + `\\s*(?:(?:${SR}|${EV})\\s*)+$`);

/** A report that clearly waits for / asks the user. */
const WAITING_RE = /\?\s*["”]?\s*$|\b(?:waiting (?:for|on) (?:you|your|the user)|waits? (?:for|on) (?:you|your|the user)|let me know|please (?:confirm|choose|decide|answer)|do you want|should i|which (?:option|one)|wartet auf (?:dich|dein|den nutzer)|warte auf (?:dich|deine?n?)|bitte (?:bestätige|entscheide|antworte)|soll ich|möchtest du|willst du)\b/i;

function isSideSessionTurn(text) {
  return typeof text === 'string' && SIDE_SESSION_TURN_PATTERN.test(text);
}

/** done | waiting — from the quoted report of a finished-turn note. */
function reportState(report) {
  const r = String(report || '').trim();
  return r && WAITING_RE.test(r) ? 'waiting' : 'done';
}

/**
 * The finished-turn notes in one text.
 * @returns {Array<{ id: string, title: string, state: 'done'|'waiting' }>}
 */
function parseNotes(text) {
  const out = [];
  if (typeof text !== 'string') return out;
  if (text.includes('you started (local_')) {
    const hits = [...text.matchAll(NOTE_RE)];
    hits.forEach((m, i) => {
      const from = m.index + m[0].length;
      const to = i + 1 < hits.length ? hits[i + 1].index : text.length;
      out.push({ id: m[2], title: m[1], state: reportState(text.slice(from, to).replace(/<\/system-reminder>[\s\S]*$/, '')) });
    });
  }
  if (text.includes('<side-sessions-event')) {
    for (const m of text.matchAll(/<side-sessions-event\b[^>]*>([\s\S]*?)(?:<\/side-sessions-event>|$)/g)) {
      const id = (m[1].match(EVENT_ID_RE) || [])[0];
      if (id && /finished/i.test(m[1])) out.push({ id, title: '', state: reportState(m[1].replace(/^[\s\S]*?finished[^\n]*\n?/i, '')) });
    }
  }
  return out;
}

function strings(value, out) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) strings(v, out);
  return out;
}

function resultText(block) {
  const c = block && block.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c.map(p => (p && typeof p.text === 'string' ? p.text : '')).join('\n');
}

/**
 * Open linked side sessions of a transcript, in start order.
 * @param {string} transcriptContent raw JSONL
 * @returns {Array<{ id: string, kind: 'session', title: string, mode: 'handoff'|'deliver', state: 'running'|'waiting' }>}
 */
function scanLinkedSessions(transcriptContent) {
  if (!transcriptContent || !transcriptContent.includes('start_session')) return [];
  const launchers = new Map(); // tool_use id → { mode, title }
  const sessions = new Map(); // local id → { title, mode, state }
  for (const raw of transcriptContent.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const hasStart = line.includes('start_session') || line.includes('Started session');
    const hasNote = line.includes('you started (local_') || line.includes('<side-sessions-event');
    if (!hasStart && !hasNote) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const content = entry && entry.message && entry.message.content;
    if (entry.type === 'assistant' && Array.isArray(content)) {
      for (const b of content) {
        if (b && b.type === 'tool_use' && b.name === START_TOOL && b.input) {
          const m = MARKER_RE.exec(String(b.input.prompt || ''));
          if (m) launchers.set(b.id, { mode: m[1] === 'deliver' ? 'deliver' : 'handoff', title: String(b.input.title || '') });
        }
      }
      continue;
    }
    if (entry.type !== 'user') continue;
    if (Array.isArray(content)) {
      for (const b of content) {
        if (!b || b.type !== 'tool_result' || !launchers.has(b.tool_use_id)) continue;
        const m = STARTED_RE.exec(resultText(b));
        if (!m) continue; // an offer/denial: not started
        const l = launchers.get(b.tool_use_id);
        sessions.set(m[2], { title: m[1] || l.title, mode: l.mode, state: 'running' });
      }
    }
    if (!hasNote) continue;
    for (const s of strings(content, [])) {
      for (const n of parseNotes(s)) {
        const known = sessions.get(n.id);
        if (!known) continue; // unmarked or unseen session: never work
        if (n.state === 'done') sessions.delete(n.id);
        else known.state = 'waiting';
      }
    }
  }
  return [...sessions.entries()].map(([id, v]) => ({ id, kind: 'session', title: v.title, mode: v.mode, state: v.state }));
}

const FULL_SCAN_CHUNK_BYTES = 4 * 1024 * 1024;

/** scanLinkedSessions over a transcript FILE of any size (long files streamed, reduced to relevant lines). */
function scanLinkedSessionsInFile(transcriptPath, tailBytes) {
  if (!transcriptPath) return [];
  let fd;
  try {
    const size = fs.statSync(transcriptPath).size;
    fd = fs.openSync(transcriptPath, 'r');
    const keep = l => l.includes('start_session') || l.includes('Started session')
      || l.includes('you started (local_') || l.includes('<side-sessions-event');
    if (size <= (tailBytes || 0)) {
      const buf = Buffer.alloc(size);
      fs.readSync(fd, buf, 0, size, 0);
      return scanLinkedSessions(buf.toString('utf8'));
    }
    const kept = [];
    const chunk = Buffer.alloc(FULL_SCAN_CHUNK_BYTES);
    let carry = Buffer.alloc(0);
    let pos = 0;
    const take = lines => { for (const l of lines) if (l && keep(l)) kept.push(l); };
    while (pos < size) {
      const n = fs.readSync(fd, chunk, 0, FULL_SCAN_CHUNK_BYTES, pos);
      if (n <= 0) break;
      pos += n;
      const data = Buffer.concat([carry, chunk.subarray(0, n)]);
      const cut = data.lastIndexOf(10);
      if (cut < 0) { carry = data; continue; }
      take(data.subarray(0, cut).toString('utf8').split('\n'));
      carry = data.subarray(cut + 1);
    }
    take(carry.toString('utf8').split('\n'));
    return scanLinkedSessions(kept.join('\n'));
  } catch {
    return [];
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

module.exports = {
  SIDE_SESSION_TURN_PATTERN, isSideSessionTurn, parseNotes, reportState,
  scanLinkedSessions, scanLinkedSessionsInFile,
};
