'use strict';
/**
 * @module project-thread
 * @version 0.2.0
 * @plugin devops
 * @description Claude Projects threads that run on this computer ("Work
 *   locally", a Claude Code session started over Remote Control). Feature
 *   `project-threads` (alpha, features.json).
 *
 *   Such a session loads the plugin like any other, but its host differs in
 *   three ways (read off a real thread transcript, 2026-11-21):
 *   - The person sees only what the `mcp__hearthbot__*` tools post. Text,
 *     `mcp__visualize__show_widget` and the session's sidebar title reach no one.
 *   - The title the person sees is the thread's, set with
 *     `mcp__hearthbot__rename_thread`.
 *   - Every prompt is a `<wake …><project id="chan_…" type="project">` envelope
 *     around the person's message; the coordinator's notes arrive as `<relay …>`.
 *   A Stop hook that blocked did not continue the turn there (one observed
 *   sample): its reason would only surface as a stale reminder on the next wake.
 *
 *   So in a thread the plugin never asks for the Desktop tools and never blocks
 *   the turn end for a card (every channel, mode `quiet`); with the feature
 *   allowed (mode `on`) the title head goes on the thread title and the
 *   completion card is posted with `post_message`.
 *
 *   Detection: the wake envelope (or the spawn note) of a prompt, or a `mcp__hearthbot__*` tool
 *   call, marks the session with a sticky per-session flag; hooks that see
 *   neither (Stop) and the MCP server read that flag, with the transcript's
 *   own `projectsUserTurn` entry as the fallback (`deep`).
 *   No dependency on the title libs, so they can require this one.
 */

const fs = require('fs');
const { sessionFile, readSessionFile, writeSessionFile } = require('./session-id');

/** features.json name of the gated half (thread titles + posted cards). */
const FEATURE = 'project-threads';
/** Sticky per-session marker: this session is a project thread. */
const THREAD_FLAG = 'dotclaude-devops-project-thread';

const HEARTHBOT_PREFIX = 'mcp__hearthbot__';
const RENAME_TOOL = `${HEARTHBOT_PREFIX}rename_thread`;
const POST_TOOL = `${HEARTHBOT_PREFIX}post_message`;
const CHECKLIST_TOOL = `${HEARTHBOT_PREFIX}update_progress_checklist`;
/** A thread is RESOLVED when its work ended; `archive_session` is for a session outside a project. */
const RESOLVE_TOOL = `${HEARTHBOT_PREFIX}set_thread_resolved`;
/** The thread's widget tool: the completion card goes out through it as the visual card (mcp-server/lib/card-widget.js threadCardWidget). */
const WIDGET_TOOL = `${HEARTHBOT_PREFIX}post_widget`;

/** The envelope every thread prompt arrives in — nothing a user types opens this way. */
const WAKE_PATTERN = /^\s*<wake\b[^>]*>\s*<project\b[^>]*\bid="chan_/;
/** A note from the coordinator or another thread: a colleague's request, not the person's prompt. */
const RELAY_PATTERN = /^\s*<(?:coordinator-relay\b|relay\s+from=|project_claude_message\b)/;
/** Uploads the runtime puts in front of an envelope: `@"C:\…\image.png" <wake …>`. */
const ATTACHMENTS = /^\s*(?:@"[^"\n]*"\s*)+(?=<(?:wake|relay|coordinator-relay|project_claude_message)\b)/;
/** A coordinator note that IS the whole prompt, as the runtime sends it (the spawn note of a local thread, a later note). */
const WHOLE_RELAY = [
  /^\s*<relay\s+from="coordinator"[^>]*\ssession="session_[^"]*"[^>]*>[\s\S]*<\/relay>\s*$/,
  /^\s*<project_claude_message\b[^>]*\sthread_id="cmsg_[^"]*"[^>]*>[\s\S]*<\/project_claude_message>\s*$/,
];
/** Transcript bytes read for the fallbacks below. */
const HEAD_BYTES = 256 * 1024;
const TAIL_BYTES = 8 * 1024 * 1024;

/** The uploads in front of an envelope, '' when there are none. */
function attachmentsOf(prompt) {
  const m = ATTACHMENTS.exec(prompt);
  return m ? m[0].trim() : '';
}

/** The prompt without uploads in front of its envelope (any other prompt: unchanged). */
function envelopeOf(prompt) {
  return typeof prompt === 'string' ? prompt.replace(ATTACHMENTS, '') : '';
}

function isWakePrompt(prompt) {
  return typeof prompt === 'string' && WAKE_PATTERN.test(envelopeOf(prompt));
}

/** The `chan_…` id of the project in a wake envelope, or '' (not a wake, no id). */
function projectId(prompt) {
  const m = /^\s*<wake\b[^>]*>\s*<project\b[^>]*\bid="(chan_[A-Za-z0-9_-]+)"/.exec(envelopeOf(prompt));
  return m ? m[1] : '';
}

function isRelayPrompt(prompt) {
  return typeof prompt === 'string' && RELAY_PATTERN.test(envelopeOf(prompt));
}

function isHearthbotTool(toolName) {
  return typeof toolName === 'string' && toolName.startsWith(HEARTHBOT_PREFIX);
}

function decodeEntities(text) {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/**
 * The person's own words inside a wake envelope, '' when the prompt is no wake
 * or carries no triggering message. Keyword classifiers (a ship order) read
 * these instead of the envelope.
 */
function personWords(prompt) {
  if (!isWakePrompt(prompt)) return '';
  const m = findTrigger(prompt);
  return m ? decodeEntities(m[2]).trim() : '';
}

/**
 * PROMPT INTAKE CONTRACT (package A, Claude Projects).
 *
 * The UserPromptSubmit dispatcher (hooks/dispatch/dispatch.js, `normalizeInput`)
 * unwraps a prompt ONCE and hands every prompt hook the same three fields next
 * to the rest of the payload:
 *
 *   prompt         the words to act on. Typed or machine prompt: the runtime's
 *                  prompt, byte-identical. Thread prompt: the person's message
 *                  (origin `person`), the coordinator's note text (`coordinator`)
 *                  or the other sender's message (`thread`) — never the envelope.
 *   prompt_raw     the runtime's prompt, untouched (the wake / relay envelope in
 *                  a thread; equal to `prompt` for typed and machine prompts).
 *   prompt_origin  who spoke:
 *                    `person`       the person's own message in a thread
 *                                   (`<message trigger="true" from="human" trust="principal">`)
 *                    `coordinator`  a coordinator note (`<relay from="coordinator">`,
 *                                   `<project_claude_message>`, `<coordinator-relay>`)
 *                    `thread`       any other thread sender: another thread's note, a
 *                                   wake without a person message
 *                    `machine`      nobody typed it: notification, cron tick, scheduled
 *                                   task, channel / side-session message (lib/non-user-prompt.js)
 *                    `typed`        a plain Desktop / terminal prompt
 *
 * Rights (Claude Projects, d-trust "alpha"): `person` and `typed` speak for the
 * person (`speaksForPerson`); `coordinator` and `thread` are colleagues
 * (`isColleagueOrigin`) — they may order work and an alpha ship, never a promote
 * to beta/stable, a force-push, a session archive or a destructive delete, and
 * they never satisfy a user-word gate (batch collect, frustration, an
 * affirmation of a card). `machine` keeps what it always had.
 *
 * Fail-closed by design: a typed prompt that STARTS with a relay tag (`<relay from=`,
 * `<project_claude_message`, `<coordinator-relay`) is classed `coordinator` — a colleague,
 * its text rewritten to the note — even on Desktop. `turnRights` is the one rights decision
 * (`person` | `colleague`) every rights hook uses: a machine prompt continues the last
 * non-machine prompt's rights, and an unreadable prompt in a marked thread is a colleague.
 *
 * For a hook that runs outside the dispatcher (a direct run, a test) the same
 * fields come from `promptFields(hook)` — the one shared function, a no-op
 * on an already normalised payload. A NON-prompt hook (PreToolUse, Stop) learns
 * the origin of the turn's prompt from the transcript: `turnPrompt(transcript)`
 * (all three fields) or `turnOrigin(transcript)` (the origin only), where
 * `transcript` is the raw JSONL text (lib/card-guard `safeReadTranscript`).
 */
const ORIGINS = Object.freeze(['person', 'coordinator', 'thread', 'machine', 'typed']);
/** The message of a wake that triggered the turn, with its attributes. */
const TRIGGER_TAG = /<message\b([^>]*?\strigger="true"[^>]*)>([\s\S]*?)<\/message>/;
const RELAY_BLOCK = /<relay\b([^>]*)>([\s\S]*?)<\/relay>/;
const NOTE_BLOCK = /<note\b[^>]*>([\s\S]*?)<\/note>/g;

/**
 * The wake's triggering <message> match ([1] attributes, [2] text), or null. A message
 * that lies INSIDE a <relay> block is a colleague's text, never the person's turn: null,
 * the relay decides. (`trigger` must be its own attribute: `data-trigger` does not count.)
 */
function findTrigger(raw) {
  const t = TRIGGER_TAG.exec(raw);
  if (!t) return null;
  const r = RELAY_BLOCK.exec(raw);
  if (r && t.index >= r.index && t.index < r.index + r[0].length) return null;
  return t;
}

function tagAttr(attrs, name) {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs || '');
  return m ? decodeEntities(m[1]) : '';
}

/** The words of a relay / project-message block: its <note> texts, else its text without tags. */
function relayWords(body) {
  const notes = [...String(body).matchAll(NOTE_BLOCK)].map((m) => m[1]);
  const text = notes.length ? notes.join('\n') : String(body).replace(/<[^>]+>/g, ' ');
  return decodeEntities(text).replace(/[ \t]+\n/g, '\n').trim();
}

const CITED_USER = /<cited\b[^>]*\sauthor="user"[^>]*>([\s\S]*?)<\/cited>/g;

/**
 * The person's own messages a colleague attached to its relay (`<cited author="user">`,
 * copied there by the claude.ai server, which says a cited entry is the person's own word
 * and can approve a step that cannot be undone). Only a cited block that is a direct part
 * of the relay counts: one written inside a `<note>` is the colleague's own text. Returns
 * the non-empty cited texts, [] for anything else. Never throws.
 */
function citedPersonWords(raw) {
  try {
    const r = RELAY_BLOCK.exec(typeof raw === 'string' ? raw : '');
    if (!r) return [];
    const outsideNotes = r[2].replace(/<note\b[^>]*>[\s\S]*?<\/note>/g, ' ');
    return [...outsideNotes.matchAll(CITED_USER)].map((m) => decodeEntities(m[1]).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** { origin, words } of a colleague note outside or inside a wake, or null. */
function parseRelay(prompt) {
  const m = RELAY_BLOCK.exec(prompt);
  if (m) {
    const from = tagAttr(m[1], 'from');
    return { origin: from === 'coordinator' || from === '' ? 'coordinator' : 'thread', words: relayWords(m[2]) };
  }
  if (isRelayPrompt(prompt)) return { origin: 'coordinator', words: relayWords(prompt) };
  return null;
}

/**
 * Classify one runtime prompt. Pure; never throws.
 * @param {string} prompt
 * @returns {{ prompt: string, prompt_raw: string, prompt_origin: 'person'|'coordinator'|'thread'|'machine'|'typed' }}
 */
function classifyPrompt(prompt) {
  const raw = typeof prompt === 'string' ? prompt : '';
  const files = attachmentsOf(raw);
  const out = (origin, words) => ({ prompt: files && origin !== 'typed' ? `${words}\n${files}`.trim() : words, prompt_raw: raw, prompt_origin: origin });
  try {
    // A typed prompt that opens with a quoted wake and goes on in the user's own words stays typed.
    if (isWholeWake(raw)) {
      const t = findTrigger(raw);
      if (t) {
        const from = tagAttr(t[1], 'from');
        const words = decodeEntities(t[2]).trim();
        if (from === 'human' && tagAttr(t[1], 'trust') === 'principal') return out('person', words);
        return out(from === 'coordinator' ? 'coordinator' : 'thread', words);
      }
      const relay = parseRelay(raw);
      return relay ? out(relay.origin, relay.words) : out('thread', '');
    }
    if (isRelayPrompt(raw)) {
      const relay = parseRelay(raw);
      return out(relay.origin, relay.words);
    }
    if (require('./non-user-prompt').isNonUserPrompt(raw)) return out('machine', raw);
  } catch { /* unreadable: the runtime's prompt stays what it was */ }
  return out('typed', raw);
}

/** The payload with `prompt` / `prompt_raw` / `prompt_origin` set; idempotent, the same object when it has no string prompt. */
function normalizePromptInput(hook) {
  if (!hook || typeof hook !== 'object' || typeof hook.prompt !== 'string') return hook;
  if (ORIGINS.includes(hook.prompt_origin) && typeof hook.prompt_raw === 'string') return hook;
  return { ...hook, ...classifyPrompt(hook.prompt) };
}

/** The three fields for a hook, normalised or not (`prompt` falls back to the legacy names). */
function promptFields(hook) {
  const h = hook && typeof hook === 'object' ? hook : {};
  const view = normalizePromptInput(typeof h.prompt === 'string' ? h : { ...h, prompt: h.user_message || h.message || '' });
  return { prompt: view.prompt, prompt_raw: view.prompt_raw, prompt_origin: view.prompt_origin };
}

/** The person (a thread message of theirs, or a typed prompt) — the word a gate needs. */
function speaksForPerson(origin) {
  return origin === 'person' || origin === 'typed';
}

/** A coordinator note or another thread's message: a colleague, not the person. */
function isColleagueOrigin(origin) {
  return origin === 'coordinator' || origin === 'thread';
}

/**
 * The turn's prompt as the transcript holds it (the last prompt entry),
 * classified like the dispatcher does. Never throws.
 * @param {string} transcriptContent raw JSONL
 */
function turnPrompt(transcriptContent) {
  let text = '';
  try { text = require('./skill-invocations').lastUserPromptText(transcriptContent); } catch { /* unreadable */ }
  return classifyPrompt(text);
}

/** The origin of the turn's prompt, read from the transcript. '' text → `typed` (nothing says otherwise). */
function turnOrigin(transcriptContent) {
  return turnPrompt(transcriptContent).prompt_origin;
}

/** Transcript text of one user entry (string content, or its text blocks). */
function entryText(entry) {
  const content = entry && entry.message && entry.message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('');
}

/** User-role entries the harness writes mid-turn (an interrupt note, a bare reminder, a local command's output). */
const HARNESS_ENTRY = /^\s*(?:\[Request interrupted by user|<system-reminder>(?:(?!<\/system-reminder>)[\s\S])*<\/system-reminder>\s*$|<local-command-(?:stdout|stderr|caveat)>)/;

/**
 * The newest prompt of the transcript that is not a machine prompt (a task notification,
 * a cron tick ...), classified; `null` when none can be found. Never throws.
 */
function lastHumanSidePrompt(transcriptContent) {
  if (typeof transcriptContent !== 'string' || !transcriptContent) return null;
  let isPromptEntry;
  try { ({ isPromptEntry } = require('./skill-invocations')); } catch { return null; }
  const lines = transcriptContent.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; } // a partial first line of a tail
    if (!entry || entry.type !== 'user' || entry.isSidechain === true || entry.isCompactSummary === true) continue;
    const text = entryText(entry);
    if (!text.trim() || HARNESS_ENTRY.test(text)) continue; // written by the harness: the prompt before it decides
    // The spawn note of a local thread is an `isMeta` entry, yet it is the prompt that started the turn.
    if (!isPromptEntry(entry) && !(entry.isMeta === true && isWholeRelay(text))) continue;
    const view = classifyPrompt(text);
    if (view.prompt_origin === 'machine') continue; // it continues earlier work: that prompt decides
    return view;
  }
  return null;
}

/**
 * THE rights decision of a tool call: whose word is this turn? `colleague` (a coordinator
 * note or another thread's message) may order work and an alpha ship, never a promote,
 * force-push, session archive or destructive delete; `person` may.
 *   - origin coordinator / thread -> colleague, unless the relay carries the person's own
 *     message (`<cited author="user">`, `citedPersonWords`) -> person: the person's attached
 *     word is their approval, so they never have to repeat it in the thread;
 *   - a machine prompt -> the last non-machine prompt decides;
 *   - no readable prompt in a marked thread -> colleague (fail closed); in any other
 *     session -> person (a Desktop session behaves as before);
 *   - anything else -> person.
 * A subagent's call carries the PARENT's transcript_path (its own transcript is a separate
 * file), so the parent turn's prompt decides: no subagent exemption.
 *
 * @param {{ session_id?: string }} hook
 * @param {string} transcriptContent raw JSONL tail
 * @returns {'person'|'colleague'}
 */
function turnRights(hook, transcriptContent) {
  const view = lastHumanSidePrompt(transcriptContent);
  if (view) {
    if (!isColleagueOrigin(view.prompt_origin)) return 'person';
    return citedPersonWords(view.prompt_raw).length ? 'person' : 'colleague';
  }
  return hook && isMarked(hook.session_id) ? 'colleague' : 'person';
}

/** Leave the sticky marker; a failed write only costs the fallback detection. */
function markThread(sessionId) {
  if (!sessionId) return;
  const file = sessionFile(THREAD_FLAG, sessionId);
  try {
    if (fs.existsSync(file)) return;
    writeSessionFile(file, new Date().toISOString());
    // The first thread session of a machine records itself (lib/thread-seen.js): the cloud-copy
    // lag counts from now on. Not under a test runner — the marker lives in the real home folder.
    if (!process.env.VITEST) require('./thread-seen').recordThreadSeen({ force: true });
  } catch { /* advisory */ }
}

/** The prompt is ONE wake envelope, start to end (what the runtime sends); a paste inside a prompt is not. */
function isWholeWake(prompt) {
  return isWakePrompt(prompt) && /<\/wake>\s*$/.test(prompt);
}

/** The prompt is ONE coordinator note with the runtime's own ids, start to end: only a thread gets such a prompt. */
function isWholeRelay(prompt) {
  const text = envelopeOf(prompt);
  return WHOLE_RELAY.some((re) => re.test(text));
}

function isMarked(sessionId) {
  return !!sessionId && readSessionFile(THREAD_FLAG, sessionId, { exact: true }) !== null;
}

/**
 * True when the transcript's opening holds a user entry Claude Code itself
 * flagged as a project turn (`projectsUserTurn: true`). Parsed, never a text
 * match: a session that only quotes a thread transcript must not count.
 */
function transcriptSaysThread(transcriptPath, maxBytes = HEAD_BYTES) {
  if (!transcriptPath) return false;
  let fd;
  try {
    fd = fs.openSync(transcriptPath, 'r');
    const buf = Buffer.alloc(Math.min(fs.fstatSync(fd).size, maxBytes));
    fs.readSync(fd, buf, 0, buf.length, 0);
    for (const line of buf.toString('utf8').split('\n')) {
      if (!line.includes('"projectsUserTurn":true')) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      if (entry && entry.type === 'user' && entry.projectsUserTurn === true) return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

/**
 * Is this session a project thread? The marker, else this call's own evidence
 * (a wake prompt, a hearthbot tool call), else — only with `deep`, for callers
 * that run once per turn — the transcript. Evidence leaves the marker.
 *
 * @param {{ session_id?: string, prompt?: string, tool_name?: string, transcript_path?: string }} hook
 * @param {{ deep?: boolean }} [opts]
 */
function isThread(hook, { deep = false } = {}) {
  if (!hook || typeof hook !== 'object') return false;
  if (isMarked(hook.session_id)) return true;
  const raw = typeof hook.prompt_raw === 'string' ? hook.prompt_raw : hook.prompt; // the dispatcher unwraps `prompt`
  // Only a prompt that is one envelope start to end (what the runtime sends): a paste with the user's own words is none.
  const wake = isWholeWake(raw);
  const other = isHearthbotTool(hook.tool_name) || (deep && transcriptSaysThread(hook.transcript_path));
  // A local thread the coordinator spawned opens with the bare spawn note, the wake comes later.
  const relay = isWholeRelay(raw);
  if (other || relay || wake) markThread(hook.session_id);
  return wake || relay || other;
}

/** The gated half: thread titles and posted cards, alpha channel only. */
function enabled(featureOpts) {
  try { return require('./features').featureAllowed(FEATURE, featureOpts); } catch { return false; }
}

/**
 * `off`: no project thread. `quiet`: a thread on a channel without the
 * feature — the Desktop instructions stay away, nothing replaces them.
 * `on`: a thread with the feature.
 *
 * @param {object} hook see `isThread`
 * @param {{ deep?: boolean, features?: object }} [opts] `features`: test injection for lib/features.js
 * @returns {'off'|'quiet'|'on'}
 */
function threadMode(hook, opts = {}) {
  if (!isThread(hook, opts)) return 'off';
  return enabled(opts.features) ? 'on' : 'quiet';
}

/** The exact rename call for `title`, JSON-escaped. */
function renameCall(title) {
  return `${RENAME_TOOL} {title:${JSON.stringify(title)}}`;
}

/** The rename call when the hook does not know the thread's title: the model does. */
function renameCallUnknown(prefix) {
  return `${RENAME_TOOL} {title:${JSON.stringify(prefix)} + <this thread's current title, without a leading "<status> ➜ <activity> " head (older: "<status> ➜ <activity> <Word> ┃ ")>}`;
}

/** The title of a `rename_thread` call in one transcript line, or undefined. */
function renamedTitleOf(line) {
  if (!line.includes(`"${RENAME_TOOL}"`)) return undefined;
  let entry;
  try { entry = JSON.parse(line); } catch { return undefined; }
  if (!entry || entry.type !== 'assistant' || entry.isSidechain) return undefined;
  const content = entry.message && entry.message.content;
  if (!Array.isArray(content)) return undefined;
  let title;
  for (const block of content) {
    if (block && block.type === 'tool_use' && block.name === RENAME_TOOL && block.input && typeof block.input.title === 'string') {
      title = block.input.title;
    }
  }
  return title;
}

/**
 * The title this session last gave its thread: the newest `rename_thread` call
 * in the transcript, or `null` (never renamed here — the title is then the one
 * the coordinator chose, which only the model can see). Never throws.
 *
 * @param {string|undefined} transcriptPath
 * @param {number} [maxBytes] only this much of the file's end is read
 * @returns {string|null}
 */
function lastThreadTitle(transcriptPath, maxBytes = TAIL_BYTES) {
  if (!transcriptPath) return null;
  let fd;
  try {
    fd = fs.openSync(transcriptPath, 'r');
    const size = fs.fstatSync(fd).size;
    const span = Math.min(size, maxBytes);
    const buf = Buffer.alloc(span);
    fs.readSync(fd, buf, 0, span, size - span);
    const lines = buf.toString('utf8').split('\n');
    // A partial first line fails to parse and is skipped below.
    for (let i = lines.length - 1; i >= 0; i--) {
      const title = renamedTitleOf(lines[i]);
      if (title !== undefined) return title.trim() ? title : null;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

/** Glyphs of a progress checklist line: done, in progress, not started. */
const CHECK_DONE = /^[✓✔✅]/u;
const CHECK_STEP = /^[✓✔✅✱○◯•]/u;

/** True when a checklist text has steps and every one of them is done. */
function checklistComplete(text) {
  if (typeof text !== 'string') return false;
  const steps = text.split('\n').map((l) => l.trim()).filter((l) => CHECK_STEP.test(l));
  return steps.length > 0 && steps.every((l) => CHECK_DONE.test(l));
}

/**
 * The in-progress (`✱`) lines of the LAST progress checklist this session
 * posted (newest `update_progress_checklist` call in the transcript), or []
 * when it posted none or its last one has no in-progress line. A checklist
 * left with `✱` after the work ended told the person a ship was still running
 * for ~11 hours.
 *
 * @param {string} transcriptContent JSONL transcript text
 * @returns {string[]}
 */
function openChecklistSteps(transcriptContent) {
  if (typeof transcriptContent !== 'string' || !transcriptContent.includes(CHECKLIST_TOOL)) return [];
  const lines = transcriptContent.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes(`"${CHECKLIST_TOOL}"`)) continue;
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }
    if (!entry || entry.type !== 'assistant' || entry.isSidechain) continue;
    const content = entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;
    let text = null;
    for (const b of content) {
      if (b && b.type === 'tool_use' && b.name === CHECKLIST_TOOL && b.input && typeof b.input.text === 'string') text = b.input.text;
    }
    if (text === null) continue;
    return text.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('✱'));
  }
  return [];
}

module.exports = {
  openChecklistSteps,
  FEATURE,
  THREAD_FLAG,
  HEARTHBOT_PREFIX,
  RENAME_TOOL,
  POST_TOOL,
  CHECKLIST_TOOL,
  RESOLVE_TOOL,
  WIDGET_TOOL,
  isWakePrompt,
  projectId,
  isRelayPrompt,
  ORIGINS,
  classifyPrompt,
  normalizePromptInput,
  promptFields,
  speaksForPerson,
  isColleagueOrigin,
  turnPrompt,
  turnOrigin,
  turnRights,
  citedPersonWords,
  isWholeWake,
  isWholeRelay,
  isHearthbotTool,
  personWords,
  markThread,
  isMarked,
  transcriptSaysThread,
  isThread,
  enabled,
  threadMode,
  renameCall,
  renameCallUnknown,
  lastThreadTitle,
  checklistComplete,
};
