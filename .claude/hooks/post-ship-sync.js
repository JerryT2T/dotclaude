#!/usr/bin/env node
/**
 * Post-ship self-update of the plugin-source repo: the do-ship Step 8 finalizer
 * as a hook, so no session can forget it (0.357.0 to 0.358.0 all did).
 *
 * Plugin developers only. This file and the hook entry in .claude/settings.json
 * live outside plugins/, so they never reach a plugin consumer; a consumer's
 * install follows its channel pin through ss.plugin.update instead.
 *
 * Trigger: PostToolUse of render_completion_card. A refused render is a tool
 * error and fires no PostToolUse, so the MCP-stale sentinel this sync writes can
 * never block the card. The work runs detached: the card does not wait for it.
 *
 * `--now` runs the sync in the foreground, for a queue orchestrator's one
 * finalizer run and for an explicit call.
 */

'use strict';

const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MARKETPLACE = 'dotclaude';
const SHIPPED_VARIANTS = new Set(['ship-successful', 'released']);
const QUEUE_STALE_MS = 6 * 60 * 60 * 1000;
const ATTEMPTS = 3;
const RETRY_MS = 15000;

const pluginsDir = (home) => path.join(home, '.claude', 'plugins');
const cloneDir = (home) => path.join(pluginsDir(home), 'marketplaces', MARKETPLACE);
const pluginDir = (home) => path.join(cloneDir(home), 'plugins', 'devops');
const logFile = (home) => path.join(pluginsDir(home), '.post-ship-sync.log');

/** Why this render starts no sync, or null when it does. Guards: reference.md Step 8. */
function skipReason({ toolInput = {}, lockoutOwner = null, queueAgeMs = null }) {
  if (!SHIPPED_VARIANTS.has(toolInput.variant)) return 'no ship on this card';
  if (toolInput.state && toolInput.state.kept) return 'keep mode';
  if (lockoutOwner === 'backlog-runner') return 'backlog run syncs after its last ship';
  if (queueAgeMs !== null && queueAgeMs < QUEUE_STALE_MS) return 'ship queue syncs after its last PR';
  return null;
}

function lockoutOwnerOf(cwd, home) {
  try {
    const { readLockout } = require(path.join(pluginDir(home), 'scripts', 'autonomous-lockout.js'));
    const lockout = readLockout(cwd);
    return lockout ? lockout.owner : null;
  } catch {
    return null;
  }
}

function queueAgeOf(cwd, now = Date.now()) {
  try {
    return now - fs.statSync(path.join(cwd, '.claude', '.ship-queue')).mtimeMs;
  } catch {
    return null;
  }
}

function installedVersion(home) {
  try {
    return JSON.parse(fs.readFileSync(path.join(pluginDir(home), '.claude-plugin', 'plugin.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] });
}

function realDeps(home) {
  return {
    remoteTags: () => git(['ls-remote', '--tags', 'origin'], cloneDir(home)).split('\n').map((l) => l.split('\t')[1]).filter(Boolean),
    runUpdateHook: () => execFileSync(process.execPath, [path.join(pluginDir(home), 'hooks', 'session-start', 'ss.plugin.update.js'), '--force'], {
      cwd: home, encoding: 'utf8', windowsHide: true, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'],
    }),
    channels: () => require(path.join(pluginDir(home), 'hooks', 'lib', 'channels.js')),
    // Required after the sync: the mirror code is the version just installed.
    mirror: () => {
      const { mirrorToRpm } = require(path.join(pluginDir(home), 'hooks', 'lib', 'desktop-copy.js'));
      const marker = JSON.parse(fs.readFileSync(path.join(pluginsDir(home), '.desktop-mirror.json'), 'utf8'));
      return marker.rpmRoot && fs.existsSync(marker.rpmRoot) ? mirrorToRpm({ pluginRoot: marker.rpmRoot, home }) : null;
    },
    sleep: (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
  };
}

/**
 * Move the install to the highest version its pin sees, then mirror it over the
 * Desktop copy so the next Desktop session starts on it. A tag can need a moment
 * to reach the clone after a ship, so the result is checked and retried.
 * @returns {{ ok: boolean, installed: string|null, target: string|null, mirror: object|null, lines: string[] }}
 */
function runSync({ home = os.homedir(), deps = realDeps(home) } = {}) {
  const lines = [];
  const { latestVisible, readChannelPin, compareVersions } = deps.channels();
  const pin = readChannelPin(pluginsDir(home), MARKETPLACE);
  let target = null;
  let installed = null;
  let ok = false;
  for (let attempt = 1; attempt <= ATTEMPTS && !ok; attempt++) {
    try {
      const best = latestVisible(deps.remoteTags(), pin);
      target = best ? best.version : target;
      deps.runUpdateHook();
    } catch (e) {
      lines.push(`attempt ${attempt}: ${e.message.split('\n')[0]}`);
    }
    installed = installedVersion(home);
    ok = Boolean(target && installed && compareVersions(installed, target) >= 0);
    if (!ok && attempt < ATTEMPTS) deps.sleep(RETRY_MS);
  }
  let mirror = null;
  try {
    mirror = deps.mirror();
  } catch (e) {
    if (e.code !== 'ENOENT') lines.push(`mirror: ${e.message.split('\n')[0]}`);
  }
  lines.push(`${ok ? 'synced' : 'MISS'}: ${pin} target ${target}, install ${installed}, mirror ${mirror ? (mirror.ok ? `${mirror.from} -> ${mirror.to}` : `failed: ${mirror.reason}`) : 'nothing to do'}`);
  return { ok, installed, target, mirror, lines };
}

function writeLog(home, result) {
  try {
    fs.writeFileSync(logFile(home), `${new Date().toISOString()}\n${result.lines.join('\n')}\n`);
  } catch { /* the version line of the next session still tells */ }
}

function fromHook(raw, home = os.homedir()) {
  let input = {};
  try { input = JSON.parse(raw); } catch { return; }
  const cwd = input.cwd || process.cwd();
  const reason = skipReason({
    toolInput: input.tool_input,
    lockoutOwner: lockoutOwnerOf(cwd, home),
    queueAgeMs: queueAgeOf(cwd),
  });
  if (reason) return;
  // cwd home: a detached child must not hold the worktree this ship removes.
  spawn(process.execPath, [__filename, '--worker'], { cwd: home, detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

if (require.main === module) {
  if (process.argv.includes('--worker')) {
    writeLog(os.homedir(), runSync());
  } else if (process.argv.includes('--now')) {
    const result = runSync();
    writeLog(os.homedir(), result);
    process.stdout.write(`${result.lines.join('\n')}\n`);
    process.exit(result.ok ? 0 : 1);
  } else {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => { raw += d; });
    process.stdin.on('end', () => { try { fromHook(raw); } catch { /* a ship is done, never fail it here */ } });
  }
}

module.exports = { skipReason, runSync, QUEUE_STALE_MS };
