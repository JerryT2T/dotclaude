#!/usr/bin/env node
/**
 * @script save-api-key
 * @version 0.1.0
 * @plugin local-llm
 * @description Save an AnythingLLM API key to the user-global config and
 *   verify it against the running AnythingLLM instance. Used by the
 *   local-llm-setup skill.
 *
 * Usage:
 *   node save-api-key.js - [base-url]   # key on stdin (never on the command line)
 *
 * Writes to: ~/.claude/local-llm/config.json
 *
 * Output: single-line JSON to stdout describing the result.
 */

'use strict';

const path = require('node:path');

const LIB = path.resolve(__dirname, '..', 'hooks', 'lib');
const http = require(path.join(LIB, 'anythingllm-http.js'));
const lifecycle = require(path.join(LIB, 'anythingllm-lifecycle.js'));
const { resolveConfig, saveApiKey, USER_CONFIG_PATH } = require(path.join(LIB, 'anythingllm-config.js'));

function readStdin() {
  try { return require('node:fs').readFileSync(0, 'utf8'); } catch { return ''; }
}

(async () => {
  // The key comes from stdin so it never reaches a shell command line or the process list.
  const apiKey = (process.argv[2] === '-' ? readStdin() : '').trim();
  const baseUrlArg = (process.argv[3] || '').trim();

  if (!apiKey) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'No API key provided on stdin (usage: save-api-key.js - [base-url]).' }));
    process.exit(1);
  }

  const config = resolveConfig();
  const baseUrl = baseUrlArg || config.anythingllm?.baseUrl || 'http://localhost:3001';
  const workspaceSlug = config.anythingllm?.workspaceSlug || 'claude-code';
  const workspaceName = config.anythingllm?.workspaceName || 'Claude Code';

  const save = () => saveApiKey(apiKey, baseUrlArg ? { baseUrl: baseUrlArg } : {});

  const health = await http.checkHealth(baseUrl);
  if (!health.online) {
    const savedPath = save(); // cannot verify while the app is down — keep the key for the next start
    const install = lifecycle.detectInstallation();
    process.stdout.write(JSON.stringify({
      ok: true,
      saved: savedPath,
      verified: false,
      phase: install.installed ? 'not_running' : 'not_installed',
      hint: install.installed
        ? `Key saved. AnythingLLM is installed but not reachable at ${baseUrl}. Start the app, then restart the session.`
        : `Key saved. AnythingLLM is not installed. Download: ${lifecycle.DOWNLOAD_URL}`,
    }));
    return;
  }

  const auth = await http.verifyAuth(baseUrl, apiKey);
  if (!auth.valid) {
    if (auth.errorType !== 'auth_failed') {
      const savedPath = save(); // network problem, not a verdict on the key
      process.stdout.write(JSON.stringify({
        ok: true, saved: savedPath, verified: false, phase: 'network_blocked',
        hint: `Key saved, but it could not be verified: ${auth.error || auth.errorType}.`,
      }));
      return;
    }
    // rejected key: leave the stored (possibly working) key untouched
    process.stdout.write(JSON.stringify({
      ok: true,
      saved: null,
      verified: false,
      phase: 'auth_failed',
      hint: `AnythingLLM rejected the key (nothing saved, the stored key is unchanged): ${auth.error || auth.errorType}. Re-run setup with a valid key.`,
    }));
    return;
  }

  const savedPath = save();

  const ws = await http.getWorkspaces(baseUrl, apiKey);
  let workspaceReady = false;
  if (ws.ok) {
    const exists = ws.workspaces.some((w) => w.slug === workspaceSlug);
    if (exists) {
      workspaceReady = true;
    } else {
      const created = await http.createWorkspace(baseUrl, apiKey, workspaceName);
      workspaceReady = created.ok;
    }
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    saved: savedPath,
    verified: true,
    phase: workspaceReady ? 'ready' : 'configuring',
    workspace: workspaceSlug,
    hint: workspaceReady
      ? 'AnythingLLM is ready. Restart the session so Claude picks up the new state.'
      : `Workspace creation failed or pending. It will retry on next SessionStart.`,
    configPath: USER_CONFIG_PATH,
  }));
})().catch((err) => {
  process.stdout.write(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
