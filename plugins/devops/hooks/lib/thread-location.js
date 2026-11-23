'use strict';
/**
 * @module thread-location
 * @version 0.2.0
 * @plugin devops
 * @description Where Claude Project threads start: on the user's computer first
 *   (default), only there, in the cloud first, or ask each time. One global
 *   value (`threadLocation.default`) plus a per-project exception
 *   (`threadLocation.projects`, entries `chan_<id>=<value>`), both global-only
 *   in hooks/lib/devops-config.js. The text a project's instructions carry for
 *   the value in effect lives in deep-knowledge/project-instructions-snippet.md
 *   (single source): each block is a fenced block whose first line is
 *   `Where threads run (devops <value>, v<BLOCK_VERSION>)`. `cloud-first` has no
 *   block. The order is a request to the coordinator, not an enforced rule.
 *
 *   `opts`: { home, cwd, pluginRoot } (tests pass a temp home).
 */

const fs = require('fs');
const path = require('path');

const VALUES = Object.freeze(['local-first', 'local-only', 'cloud-first', 'ask']);
const DEFAULT = 'local-first';
const BLOCK_VERSION = 1;
const INHERIT = 'inherit';
const PROJECT_ID = /^chan_[A-Za-z0-9_-]+$/;

const cfg = () => require('./devops-config');

function isProjectId(id) {
  return typeof id === 'string' && PROJECT_ID.test(id);
}

/** `chan_x=value` entries as a map; entries with an unknown value or malformed id are ignored. */
function parseEntries(list) {
  const out = {};
  for (const raw of Array.isArray(list) ? list : []) {
    if (typeof raw !== 'string') continue;
    const i = raw.indexOf('=');
    if (i < 0) continue;
    const id = raw.slice(0, i).trim();
    const value = raw.slice(i + 1).trim().toLowerCase();
    if (isProjectId(id) && VALUES.includes(value)) out[id] = value;
  }
  return out;
}

/**
 * The stored settings.
 * @returns {{global:string, projects:Object<string,string>}}
 */
function read(opts = {}) {
  let v = {};
  try { v = cfg().load(opts.cwd, { home: opts.home }).values.threadLocation || {}; } catch { /* defaults */ }
  return {
    global: VALUES.includes(v.default) ? v.default : DEFAULT,
    projects: parseEntries(v.projects),
  };
}

/**
 * The value in effect for a project (or globally when `projectId` is empty).
 * @returns {{value:string, source:'project'|'global'|'default'}}
 */
function effective(projectId, opts = {}) {
  const { global, projects } = read(opts);
  if (projectId && Object.prototype.hasOwnProperty.call(projects, projectId)) return { value: projects[projectId], source: 'project' };
  const stored = cfg().load(opts.cwd, { home: opts.home }).sources['threadLocation.default'];
  return { value: global, source: stored === 'global' ? 'global' : 'default' };
}

/**
 * Store the global value, or with `project` that project's exception
 * (`inherit` removes it).
 * @throws {Error} unknown value or malformed project id; the message names the valid ones
 */
function set(value, { project } = {}, opts = {}) {
  const v = String(value || '').trim().toLowerCase();
  const home = { home: opts.home };
  if (project === undefined || project === null || project === '') {
    if (!VALUES.includes(v)) throw new Error(`unknown value "${value}" — valid: ${VALUES.join(', ')}`);
    cfg().setValue('threadLocation.default', v, 'global', opts.cwd, home);
    return read(opts);
  }
  if (!isProjectId(project)) throw new Error(`malformed project id "${project}" — expected chan_<id>; valid values: ${VALUES.join(', ')}`);
  if (v !== INHERIT && !VALUES.includes(v)) throw new Error(`unknown value "${value}" — valid: ${[...VALUES, INHERIT].join(', ')}`);
  const projects = read(opts).projects;
  if (v === INHERIT) delete projects[project];
  else projects[project] = v;
  const entries = Object.entries(projects).map(([id, val]) => `${id}=${val}`);
  if (entries.length) cfg().setValue('threadLocation.projects', entries, 'global', opts.cwd, home);
  else cfg().unsetValue('threadLocation.projects', 'global', opts.cwd, home);
  return read(opts);
}

/** `devops local-first, v1`, or null for a value without a block (cloud-first, unknown). */
function marker(value) {
  return VALUES.includes(value) && value !== 'cloud-first' ? `devops ${value}, v${BLOCK_VERSION}` : null;
}

/** The snippet doc, where every block lives. */
function snippetFile(opts = {}) {
  const root = opts.pluginRoot || path.join(__dirname, '..', '..');
  return path.join(root, 'deep-knowledge', 'project-instructions-snippet.md');
}

/**
 * The block text for `value`: the content of the fenced block in the snippet doc
 * whose first line carries the value's marker. null for cloud-first or when the
 * doc has no such block.
 */
function block(value, opts = {}) {
  const m = marker(value);
  if (!m) return null;
  let text;
  try { text = fs.readFileSync(snippetFile(opts), 'utf8'); } catch { return null; }
  const re = /^```[^\n]*\n([\s\S]*?)\n```[ \t]*$/gm;
  for (let hit = re.exec(text); hit; hit = re.exec(text)) {
    const first = hit[1].split(/\r?\n/, 1)[0];
    if (first.trim() === `Where threads run (${m})`) return hit[1].replace(/\r\n/g, '\n');
  }
  return null;
}

/**
 * Is the feature `project-threads` allowed on this channel? For the callers that
 * surface the setting (script, Home row); the stored values are read either way.
 * @param {object} [opts] passed to `featureAllowed` (tests: pluginRoot, home, channel)
 */
function featureOn(opts) {
  try { return require('./features').featureAllowed('project-threads', opts); } catch { return false; }
}

module.exports = { VALUES, DEFAULT, BLOCK_VERSION, INHERIT, isProjectId, read, effective, set, marker, block, snippetFile, featureOn };
