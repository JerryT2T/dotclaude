'use strict';
/**
 * @module cloud-update
 * @version 0.1.0
 * @plugin devops
 * @description Starting the claude.ai cloud copy update instead of only
 *   telling the user — the decision, the claim and the instruction.
 *
 *   The cloud copy of devops (cloud threads, cloud sessions) syncs only on
 *   claude.ai: Customize → Plugins → Manage marketplaces → dotclaude "…" →
 *   Check for updates. A hook cannot click there; a SESSION with a browser tool
 *   can, as part of a turn that runs anyway. This module decides WHEN a session
 *   should, makes sure only ONE does, and words what it is told to do:
 *
 *   - wanted: switch devops-config `cloud.autoUpdate` on (default), a thread ran
 *     on this machine (lib/thread-seen.js — otherwise the lag stays harmless and
 *     is only mentioned), and the account copy trails the install here;
 *   - one updater at a time, once per version: `claimUpdate` records the attempt
 *     of a version in `~/.claude/devops-cloud-update.json` under an atomic lock
 *     dir, so parallel sessions and threads do not all start it. A claim that
 *     was never finished is retried after 3 h, one that needed the person after
 *     24 h, a finished one (sync requested) after 48 h if the copy still lags.
 *   - never a login: the instruction forbids automating one and makes the
 *     session name the one click that is left.
 *
 *   Pure fs; no network, no browser — the session does that.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const STATE_FILE = 'devops-cloud-update.json';
const HOUR = 60 * 60 * 1000;
/** How long an attempt blocks the next one, by how it ended. */
const RETRY_MS = Object.freeze({ started: 3 * HOUR, manual: 24 * HOUR, done: 48 * HOUR });
const LOCK_STALE_MS = 10 * 60 * 1000;

const stateFile = (home) => path.join(home, '.claude', STATE_FILE);
const defaultLock = (home) => path.join(home, '.claude', 'devops-cloud-update.lock');

function readState(home) {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(home), 'utf8'));
    return s && typeof s.attempts === 'object' && s.attempts ? s : { attempts: {} };
  } catch {
    return { attempts: {} };
  }
}

function writeState(home, state) {
  fs.mkdirSync(path.dirname(stateFile(home)), { recursive: true });
  fs.writeFileSync(stateFile(home), JSON.stringify(state, null, 2) + '\n');
}

/** Atomic lock dir around a read-modify-write; a stale one (crashed holder) is taken over. */
function withLock(lockDir, now, fn) {
  try {
    fs.mkdirSync(path.dirname(lockDir), { recursive: true });
    fs.mkdirSync(lockDir);
  } catch {
    try {
      if (now - fs.statSync(lockDir).mtimeMs < LOCK_STALE_MS) return { locked: false };
      fs.rmSync(lockDir, { recursive: true, force: true });
      fs.mkdirSync(lockDir);
    } catch {
      return { locked: false };
    }
  }
  try {
    return { locked: true, value: fn() };
  } finally {
    try { fs.rmSync(lockDir, { recursive: true, force: true }); } catch { /* goes stale */ }
  }
}

/** Is the switch on? `cloud.autoUpdate` of devops-config (global), default on. */
function switchOn(home = os.homedir()) {
  try {
    return require('./devops-config').load(home, { home }).values.cloud.autoUpdate !== false;
  } catch {
    return true;
  }
}

/**
 * Take the update claim for `version`. At most one session wins: while any
 * attempt is still "started" and young, or this version was attempted recently,
 * nobody else claims.
 * @returns {{claimed:boolean, reason?:string}}
 */
function claimUpdate({ home = os.homedir(), version, now = Date.now(), lockDir = defaultLock(home) }) {
  const res = withLock(lockDir, now, () => {
    const state = readState(home);
    for (const [v, rec] of Object.entries(state.attempts)) {
      const age = now - Date.parse(rec.at);
      if (rec.state === 'started' && age < RETRY_MS.started) return { claimed: false, reason: v === version ? 'another session holds the claim' : `another session updates ${v}` };
    }
    const own = state.attempts[version];
    if (own && now - Date.parse(own.at) < (RETRY_MS[own.state] || RETRY_MS.done)) return { claimed: false, reason: `already ${own.state} for ${version}` };
    state.attempts[version] = { state: 'started', at: new Date(now).toISOString() };
    writeState(home, state);
    return { claimed: true };
  });
  return res.locked ? res.value : { claimed: false, reason: 'another session is claiming' };
}

/**
 * Record how an attempt ended: `done` (sync requested), `manual` (a click is left
 * for the person), `release` (this session cannot run it — free the claim).
 * @returns {boolean}
 */
function markUpdate({ home = os.homedir(), version, state, now = Date.now(), lockDir = defaultLock(home) }) {
  if (!['done', 'manual', 'release'].includes(state)) return false;
  const res = withLock(lockDir, now, () => {
    const s = readState(home);
    if (state === 'release') delete s.attempts[version];
    else s.attempts[version] = { state, at: new Date(now).toISOString() };
    writeState(home, s);
    return true;
  });
  return res.locked && res.value;
}

/**
 * Should THIS session start the update, and may it? Claims on yes.
 * @param {{home?:string, version:string, cloudVersion:string, threadSeen:boolean, now?:number, lockDir?:string}} p
 * @returns {{start:boolean, reason:string}}
 */
function planCloudUpdate({ home = os.homedir(), version, cloudVersion, threadSeen, now = Date.now(), lockDir }) {
  if (!switchOn(home)) return { start: false, reason: 'devops-config cloud.autoUpdate is off' };
  if (!threadSeen) return { start: false, reason: 'no Claude Project thread ran on this machine: the lag is harmless' };
  const claim = claimUpdate({ home, version, now, ...(lockDir && { lockDir }) });
  return claim.claimed ? { start: true, reason: `claimed ${version} (cloud copy ${cloudVersion})` } : { start: false, reason: claim.reason };
}

const STEPS = 'claude.ai → Customize → Plugins → Manage marketplaces → dotclaude "…" → Check for updates';

/**
 * The context block that makes the session run the update itself.
 * @param {{version:string, cloudVersion:string, script:string, lang?:string}} p
 */
function updateInstruction({ version, cloudVersion, script, lang = 'de' }) {
  const s = String(script).replace(/\\/g, '/');
  const cmd = (state) => `node "${s}" ${state} ${version}`;
  const say = lang === 'en'
    ? { done: `Cloud update requested (claude.ai syncs on its own schedule, often within hours)`, manual: 'the exact click that is left' }
    : { done: `Cloud-Update angestoßen (claude.ai synct nach eigenem Takt, oft binnen Stunden)`, manual: 'den genauen Klick, der noch fehlt' };
  return [
    `[ss.cloud.update] The claude.ai copy of devops (what cloud threads and cloud sessions run) is on ${cloudVersion}; ${version} is installed here. You hold the update claim for ${version}: one updater at a time, once per version.`,
    'Start the update YOURSELF, as part of a turn that runs anyway: after the work of the person\'s request, before your final reply — never a turn of its own, never a question first.',
    'Not in a Claude Project thread (a `<wake …><project …>` prompt) and not without a browser tool for logged-in sites (Claude in Chrome): there run ' + `\`${cmd('release')}\`` + ' and skip.',
    `Steps (skills/auto-update/SKILL.md § "Cloud updaten"): open https://claude.ai in the browser tool, then ${STEPS} — click each step yourself. Do not start auto-guide: the person is not asked to click.`,
    `NEVER automate a login: when claude.ai shows a login, a captcha or a two-factor prompt, stop there, run \`${cmd('manual')}\` and tell the person in one line ${say.manual} ("Log in to claude.ai in the open tab" / "Click Check for updates under ${STEPS.split(' → ').slice(1, 4).join(' → ')}").`,
    `Click went through: run \`${cmd('done')}\` and say once: "${say.done}". Any other failure: run \`${cmd('manual')}\` and name the step that failed.`,
  ].join('\n');
}

module.exports = { STATE_FILE, RETRY_MS, STEPS, switchOn, claimUpdate, markUpdate, planCloudUpdate, updateInstruction, readState };
