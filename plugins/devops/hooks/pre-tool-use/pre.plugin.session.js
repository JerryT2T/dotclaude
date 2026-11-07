#!/usr/bin/env node
/**
 * @hook pre.plugin.session
 * @version 0.1.0
 * @event PreToolUse
 * @plugin devops
 * @matcher mcp__ccd_session__start_session
 * @description Refuse once a plugin fix session started from a consumer project
 *   before the upstream issue is filed (#1076).
 *
 *   A consumer session that asks for a change to the devops plugin may start a
 *   session in the plugin source repo right away. The scope-routing rule
 *   (deep-knowledge/plugin-scope-routing.md) still requires an upstream issue
 *   via auto-issue — without it the change is not traceable. The reminder hook
 *   (prompt.plugin.scope) fires only on trigger words, so this path slipped
 *   through it.
 *
 *   Refuses (exit 2) when ALL hold:
 *     - the calling session is NOT the plugin source repo,
 *     - the new session targets the plugin: its `cwd` is the plugin source
 *       repo, or its brief carries a plugin signal (prompt.plugin.scope's
 *       PLUGIN_SIGNALS),
 *     - auto-issue did not run in this turn (same check as pre.issue.guard),
 *     - this exact call was not refused before (refuse ONCE: the retry with
 *       the same input passes, so a brief that only mentions the plugin never
 *       wedges).
 */

require('../lib/plugin-guard');

const crypto = require('crypto');
const fs = require('fs');
const { parseHookInput } = require('../lib/hook-input');

const TOOL = 'mcp__ccd_session__start_session';

/** Every string of the tool input, joined — the brief's field names may change. */
function inputText(input) {
  const out = [];
  const walk = (v, depth) => {
    if (depth > 4 || v == null) return;
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(x => walk(x, depth + 1));
    else if (typeof v === 'object') Object.values(v).forEach(x => walk(x, depth + 1));
  };
  walk(input, 0);
  return out.join('\n');
}

/** Does the new session target the devops plugin? */
function targetsPlugin(input, deps) {
  const cwd = input && typeof input.cwd === 'string' ? input.cwd : '';
  if (cwd && deps.isPluginSourceRepo(deps.gitTopLevel(cwd))) return true;
  return deps.hasPluginSignal(inputText(input));
}

function defaultDeps() {
  const scope = require('../lib/plugin-scope');
  return {
    gitTopLevel: scope.gitTopLevel,
    isPluginSourceRepo: scope.isPluginSourceRepo,
    upstreamSlug: scope.upstreamSlug,
    hasPluginSignal: require('../user-prompt-submit/prompt.plugin.scope').hasPluginSignal,
    issueThisTurn: require('./pre.issue.guard').setupIssueInvokedThisTurn,
  };
}

function markerFile(hook) {
  const { sessionFile } = require('../lib/session-id');
  return sessionFile('dotclaude-plugin-session-refused', hook.session_id);
}

/**
 * @param {string} inputData raw stdin
 * @param {object} [deps] injected for tests
 * @returns {string} deny text, '' = allow
 */
function decide(inputData, deps = defaultDeps()) {
  const hook = parseHookInput(inputData);
  if (!hook || hook.tool_name !== TOOL) return '';
  const input = hook.tool_input && typeof hook.tool_input === 'object' ? hook.tool_input : {};
  const here = deps.gitTopLevel(hook.cwd || process.cwd());
  if (deps.isPluginSourceRepo(here)) return '';
  if (!targetsPlugin(input, deps)) return '';
  if (deps.issueThisTurn(hook)) return '';
  const sig = crypto.createHash('sha1').update(JSON.stringify(input)).digest('hex');
  const file = deps.markerFile ? deps.markerFile(hook) : markerFile(hook);
  try { if (fs.readFileSync(file, 'utf8') === sig) return ''; } catch { /* no marker yet */ }
  // Unwritable marker → allow: without it the retry could never pass, and refusing ONCE is the contract.
  try { fs.writeFileSync(file, sig); } catch { return ''; }
  const slug = deps.upstreamSlug();
  return (
    'Refused once: this session is a CONSUMER of the devops plugin and the new session targets the plugin itself.\n' +
    `Rule: every plugin change requested from a consumer project gets an upstream issue in ${slug} ` +
    '(deep-knowledge/plugin-scope-routing.md), even when a fix session starts right away.\n' +
    'Fix: invoke Skill("devops:auto-issue") first (target_repo ' + slug + '), give the user the issue URL, ' +
    'and put it into the new session\'s brief. Then start the session again.\n' +
    'Not about the plugin after all? Send the same call again — it passes.\n'
  );
}

if (require.main === module) {
  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { inputData += d; });
  process.stdin.on('end', () => {
    let text = '';
    try { text = decide(inputData); } catch { text = ''; }
    if (!text) process.exit(0);
    process.stderr.write(text);
    process.exit(2);
  });
}

module.exports = { decide, targetsPlugin, inputText, TOOL };
