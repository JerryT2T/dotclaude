#!/usr/bin/env node
/**
 * @hook pre.title.topic
 * @version 0.1.0
 * @event PreToolUse
 * @plugin devops
 * @matcher mcp__ccd_session_mgmt__set_session_title
 * @description Enforces the 20-character session-title topic (user decision
 *   d-len, 2026-11-17): a set_session_title whose topic — the text after the
 *   `<status> ➜ <icon> <Word> ┃ ` head — is longer than TOPIC_MAX is refused
 *   once per topic with the reason and the length, so the model shortens it
 *   itself (abbreviations welcome, d-abbr). Never refused: a call that keeps
 *   the title's current topic (a status-prefix swap — most title calls of the
 *   other hooks), a title without a `┃` head, a batch title (its skill owns
 *   it), an unknown current title (no Desktop app / no transcript), and a
 *   repeat of a topic already refused (no loop). Silent inside a subagent.
 *   Fail-open.
 */

require('../lib/plugin-guard');

const { TOPIC_MAX, topicOf } = require('../lib/title-budget');

const MARKER = '[title-topic]';
const SET_TOOL = 'mcp__ccd_session_mgmt__set_session_title';

function length(s) { return Array.from(s).length; }

function refusalText(topic) {
  return `${MARKER} The session title topic «${topic}» is ${length(topic)} characters — the limit is ${TOPIC_MAX}. ` +
    `Send ${SET_TOOL} again with the same prefix and a topic of at most ${TOPIC_MAX} characters ` +
    '(a noun phrase naming the subject; abbreviations allowed, if needed). Do not mention this to the user.';
}

/** The text of a message line's content blocks (tool_result strings or text blocks). */
function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((b) => (b && (typeof b.content === 'string' ? b.content : textOf(b.content || b.text))) || '').join('\n');
}

/** True when an earlier tool result in the transcript tail refused this very topic. */
function alreadyRefused(text, topic) {
  const needle = `«${topic}»`;
  for (const line of String(text || '').split('\n')) {
    if (!line.includes(MARKER)) continue;
    try {
      const t = textOf(JSON.parse(line).message.content);
      if (t.includes(MARKER) && t.includes(needle)) return true;
    } catch { /* not a message line */ }
  }
  return false;
}

/** The refusal for a too-long NEW topic, or null. */
function refusal(hook) {
  const title = hook.tool_input && hook.tool_input.title;
  const topic = topicOf(title);
  if (!topic || length(topic) <= TOPIC_MAX) return null;
  const { classify } = require('../lib/title-scheme');
  if (classify(title) === 'batch') return null;
  const { readCurrentTitle } = require('../lib/session-title');
  const current = readCurrentTitle(hook.transcript_path);
  if (current === null || current === undefined) return null;
  if (topicOf(current) === topic) return null;
  const text = require('../lib/agent-card-relay').readTail(hook.transcript_path);
  if (alreadyRefused(text, topic)) return null;
  return { block: refusalText(topic) };
}

function main(hook) {
  if (hook.tool_name && hook.tool_name !== SET_TOOL) return null;
  if (hook.agent_id) return null;
  return refusal(hook);
}

if (require.main === module) {
  try {
    require('../lib/hook-input').runHook(main, { event: 'PreToolUse' });
  } catch {
    // fail open
  }
}

module.exports = { main, refusalText, MARKER };
