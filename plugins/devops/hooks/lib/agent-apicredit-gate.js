/**
 * @module agent-apicredit-gate
 * @version 0.1.0
 * @description Should this read-only devops Agent spawn be refused once so the
 *   API credit is tried first? (#1013: 71 in-session scout/research/redteam
 *   spawns vs 5 API runs in a week, with the credit on.)
 *
 *   Only `devops:scout`, `devops:research`, `devops:redteam` are gated —
 *   `general-purpose` / `Explore` stay free (read-only is not decidable from a
 *   prompt). Once per agent type per turn: the refusal carries the ready
 *   `claude-api-agent.js` command; a prompt that cites the API rc it falls
 *   back from passes. Stateless like agent-model-gate (the transcript tells
 *   whether this type was already refused this turn). Fail-open.
 */

'use strict';

const path = require('path');
const G = require('./agent-model-gate');

const MARKER = '[api-credit-first]';
const TAGS = { 'devops:scout': 'scout', 'devops:research': 'research', 'devops:redteam': 'redteam' };

// Only a concrete number counts as a citation: "rc 75", "rc=124", "exit code 127".
const RC_CITED = /\b(?:rc|exit(?:\s+code)?)\s*[:=]?\s*(?:75|124|126|127|1)\b/i;

function tagOf(input) {
  return TAGS[String((input && input.subagent_type) || '').trim()] || null;
}

function citesRc(prompt) {
  return RC_CITED.test(String(prompt || ''));
}

/** Is the credit usable right now (switch on, key, no limit)? Any error → not usable. */
function creditUsable({ cwd, home, env = process.env, now } = {}) {
  try {
    if (env.DEVOPS_DISABLE_CLAUDE_API === '1') return false;
    const safe = require('../../scripts/claude-api-safe');
    if (!safe.loadSwitches({ cwd, home }).enabled) return false;
    if (!safe.resolveKey({ env, home })) return false;
    return !safe.activeLimit({ home, now });
  } catch {
    return false;
  }
}

/** Was this agent type already refused by this gate earlier in the current turn? */
function refusedBefore(transcriptText, input, toolUseId) {
  const type = input.subagent_type;
  const spawns = new Map();
  const refused = new Set();
  for (const line of String(transcriptText || '').split('\n')) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.isSidechain) continue;
    if (G.isPromptEntry(e)) { spawns.clear(); refused.clear(); continue; }
    const content = e.message && e.message.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (!b) continue;
      if (e.type === 'assistant' && b.type === 'tool_use' && b.name === 'Agent' && b.id !== toolUseId) spawns.set(b.id, b.input || {});
      if (e.type === 'user' && b.type === 'tool_result' && G.resultText(b).includes(MARKER)) refused.add(b.tool_use_id);
    }
  }
  for (const id of refused) {
    const prev = spawns.get(id);
    // A refusal whose spawn fell off the transcript tail counts as this type's:
    // refusing again on a cut-off tail could loop — fail open instead.
    if (!prev || prev.subagent_type === type) return true;
  }
  return false;
}

/** @returns {boolean} true → refuse this spawn once */
function wouldRefuse(input, transcriptText, toolUseId, ctx) {
  if (!tagOf(input) || citesRc(input.prompt)) return false;
  if (!String(transcriptText || '').trim()) return false; // retry not recognisable → fail open
  if (!creditUsable(ctx)) return false;
  return !refusedBefore(transcriptText, input, toolUseId);
}

function refusalText(input) {
  const tag = tagOf(input);
  const script = path.join(__dirname, '..', '..', 'scripts', 'claude-api-agent.js').replace(/\\/g, '/');
  const flags = tag === 'research' ? ' --web' : '';
  return (
    `${MARKER} Spawn refused once: api-credit is on with a key, so read-only \`${input.subagent_type}\` work goes to the API credit FIRST. ` +
    `Run in a background Bash: \`node "${script}" --tag ${tag}${flags} "<the task of this spawn>"\` ` +
    '(add --locate for pure locating, --root DIR for another repo). ' +
    'rc≠0 (75/124/126/127/1) → spawn the Agent again and cite the rc in its prompt (allowed, passes).'
  );
}

module.exports = { MARKER, TAGS, tagOf, citesRc, creditUsable, refusedBefore, wouldRefuse, refusalText };
