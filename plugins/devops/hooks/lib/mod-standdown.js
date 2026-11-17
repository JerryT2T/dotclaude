'use strict';
/**
 * @module mod-standdown
 * @description Stand-down marker for a second writer (#1102 Part A,
 *   docs/dev/mods.md red-team finding 3). A mod that takes over a hook's job
 *   writes a marker keyed by session id, with a heartbeat and the devops
 *   version; the hook stands down only while that marker is valid. **Default:
 *   the hooks run** — no marker, an unreadable one, another session's, another
 *   devops version, or a heartbeat older than the TTL all mean "run".
 *
 *   NOT wired: no hook reads it and no mod writes it yet. Session titles have no
 *   mod-side writer on the current engine (Spike 3, docs/dev/mods.md), so the
 *   title hooks keep running everywhere; the lib is ready for the first job a
 *   mod can really take over.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

/** A writer that stopped beating this long ago is gone (a crashed or unloaded mod). */
const HEARTBEAT_TTL_MS = 90 * 1000;

function markerDir(home = os.homedir()) {
  return path.join(home, '.claude', 'devops-mod-standdown');
}

/** Session ids become file names: anything outside [A-Za-z0-9_-] is refused, never escaped. */
function markerPath(sessionId, home) {
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) return null;
  return path.join(markerDir(home), `${sessionId}.json`);
}

/**
 * The writer's beat: `{ sessionId, job, version, heartbeat }`, written via a
 * temp file + rename. False when it could not be written (the hooks then run).
 */
function beat(sessionId, job, version, { now = Date.now(), home } = {}) {
  const file = markerPath(sessionId, home);
  if (!file || typeof job !== 'string' || !job || typeof version !== 'string' || !version) return false;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let jobs = {};
    try {
      const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (prev && prev.sessionId === sessionId && prev.jobs && typeof prev.jobs === 'object') jobs = prev.jobs;
    } catch { /* first beat */ }
    jobs[job] = { version, heartbeat: now };
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ sessionId, jobs }), 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

/** The writer lets go of a job (unload, gate closed): the hooks run again at once. */
function release(sessionId, job, { home } = {}) {
  const file = markerPath(sessionId, home);
  if (!file) return;
  try {
    const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (prev && prev.jobs) delete prev.jobs[job];
    if (!prev || !prev.jobs || !Object.keys(prev.jobs).length) fs.unlinkSync(file);
    else fs.writeFileSync(file, JSON.stringify(prev), 'utf8');
  } catch { /* nothing to release */ }
}

/**
 * Should the hook do `job` for this session? True unless a valid marker says
 * the mod does it: same session, same devops `version`, heartbeat within the
 * TTL (and not in the future beyond a small clock skew).
 */
function hooksRun(sessionId, job, version, { now = Date.now(), home } = {}) {
  const file = markerPath(sessionId, home);
  if (!file) return true;
  try {
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    const j = m && m.sessionId === sessionId && m.jobs && m.jobs[job];
    if (!j || j.version !== version || typeof j.heartbeat !== 'number') return true;
    const age = now - j.heartbeat;
    return !(age >= -5000 && age < HEARTBEAT_TTL_MS);
  } catch {
    return true;
  }
}

module.exports = { HEARTBEAT_TTL_MS, markerDir, markerPath, beat, release, hooksRun };
