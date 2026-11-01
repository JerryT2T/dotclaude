#!/usr/bin/env node
/**
 * @hook post.backup.routine
 * @version 0.1.0
 * @event PostToolUse
 * @plugin devops
 * @matcher mcp__scheduled-tasks__(create|update)_scheduled_task|RemoteTrigger
 * @description Backs up a RECURRING routine right after it was created or
 *   changed — a Desktop scheduled task (cron) or a cloud routine
 *   (RemoteTrigger create/update). One-time (fireAt / run_once_at), ad-hoc
 *   and session crons (CronCreate, not matched) are skipped.
 *
 *   Token budget is the point: the normal path prints nothing.
 *     homeBackup.onRoutineChange auto → spawn `home-backup.js run` detached,
 *                                       silent (a same-day run amends that
 *                                       day's version, so many triggers cost
 *                                       one commit)
 *     ask (default)                   → one line of context, once per session
 *     off                             → nothing; the daily run still covers it
 *   Backup not set up → one setup hint, once per machine (marker file), never
 *   again. A cloud routine lives only on the server, so its last known JSON
 *   (tool input + response) is written to ~/.claude/routine-snapshots/cloud/
 *   first — the secret scan of home-backup applies to it like to any file.
 *   Fail open: every error exits 0 silently.
 */

require('../lib/plugin-guard');

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DESKTOP = /^mcp__scheduled-tasks__(create|update)_scheduled_task$/;
const HINT_MARKER = 'home-backup-routine-hint';
const ASK_PREFIX = 'dotclaude-devops-routine-backup-asked';

const has = (v) => v !== undefined && v !== null && v !== '';

/** Keys anywhere in a JSON-ish value whose name matches `re` and whose value is set. */
function hasKey(value, re, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 6) return false;
  return Object.entries(value).some(([k, v]) => (re.test(k) && has(v) && v !== false) || hasKey(v, re, depth + 1));
}

function parseMaybe(v) {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
}

/**
 * What changed: `{kind, name, verb, recurring}` or null when the call is no
 * routine write.
 */
function classify(hook) {
  const tool = hook.tool_name || '';
  const input = hook.tool_input || {};
  const m = DESKTOP.exec(tool);
  if (m) {
    const create = m[1] === 'create';
    // an update without schedule fields keeps the old one, unknown here — a backup is cheap, so count it
    const recurring = create ? has(input.cronExpression) : !has(input.fireAt);
    return { kind: 'desktop', name: String(input.taskId || 'task'), verb: create ? 'created' : 'changed', recurring };
  }
  if (tool !== 'RemoteTrigger') return null;
  const action = input.action;
  if (action !== 'create' && action !== 'update') return null;
  const body = input.body || {};
  const response = parseMaybe(hook.tool_response);
  const cron = /cron/i;
  const once = /run_once|once_at|fire_at|run_at/i;
  let recurring;
  if (hasKey(body, cron)) recurring = true;
  else if (hasKey(body, once)) recurring = false;
  else if (hasKey(response, cron)) recurring = true;
  else recurring = action === 'update' && !hasKey(response, once);
  const id = input.trigger_id
    || (response && typeof response === 'object' && (response.id || (response.trigger && response.trigger.id)))
    || ((/"id"\s*:\s*"(trig[\w-]*)"/.exec(typeof hook.tool_response === 'string' ? hook.tool_response : JSON.stringify(hook.tool_response || '')) || [])[1])
    || `new-${crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12)}`;
  const name = String(body.name || body.title || id);
  return { kind: 'cloud', id: String(id), name, verb: action === 'create' ? 'created' : 'changed', recurring, body, response };
}

/** Last known JSON of a cloud routine; returns true when the file changed. */
function writeCloudSnapshot(home, info) {
  const dir = path.join(home, '.claude', 'routine-snapshots', 'cloud');
  const file = path.join(dir, `${info.id.replace(/[^\w.-]/g, '_')}.json`);
  const data = `${JSON.stringify({ id: info.id, name: info.name, lastAction: info.verb, body: info.body, response: info.response ?? null }, null, 2)}\n`;
  try { if (fs.readFileSync(file, 'utf8') === data) return false; } catch { /* new */ }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, data);
  return true;
}

function backupScript() {
  return path.resolve(__dirname, '..', '..', 'scripts', 'home-backup.js');
}

function spawnRun(script) {
  const { spawn } = require('child_process');
  const child = spawn(process.execPath, [script, 'run'], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

/** Write a marker once; false when it already existed. */
function once(file) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, new Date().toISOString(), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

function main(hook, opts = {}) {
  const info = classify(hook);
  if (!info || !info.recurring) return null;
  const home = opts.home || os.homedir();
  const s = require('../lib/devops-config').load(home, { home }).values.homeBackup;
  if (s.onRoutineChange === 'off') return null;
  const script = (opts.script || backupScript()).replace(/\\/g, '/');
  const label = `${info.kind === 'cloud' ? 'cloud routine' : 'scheduled task'} "${info.name}"`;

  if (!s.enabled) {
    if (!once(path.join(home, '.claude', HINT_MARKER))) return null;
    return {
      context: `[home-backup] Recurring ${label} ${info.verb}; no backup is set up. Offer it once in one sentence (targets: private GitHub repo, a folder — local/NAS/Google Drive for Desktop —, an rclone remote, or an own command; runbook deep-knowledge/home-backup.md). Do not repeat this offer.`,
    };
  }

  if (info.kind === 'cloud') writeCloudSnapshot(home, info);
  if (s.onRoutineChange === 'auto') {
    (opts.spawn || spawnRun)(script);
    return null;
  }
  const { sessionFile } = require('../lib/session-id');
  if (!once(opts.askFile || sessionFile(ASK_PREFIX, hook.session_id))) return null;
  return {
    context: `[home-backup] Recurring ${label} ${info.verb}. Ask the user once, briefly, whether to back it up now; yes → node "${script}" run. If they want this always without asking: node "${script.replace(/home-backup\.js$/, 'devops-config.js')}" set homeBackup.onRoutineChange auto --global (never asking: off). Otherwise the daily run covers it.`,
  };
}

if (require.main === module) {
  try { require('../lib/hook-input').runHook(main, { event: 'PostToolUse' }); } catch { /* fail open */ }
}

module.exports = { main, classify, writeCloudSnapshot };
