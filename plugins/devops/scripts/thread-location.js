#!/usr/bin/env node
/**
 * @script thread-location
 * @version 0.1.0
 * @plugin devops
 * @description Where Claude Project threads start (hooks/lib/thread-location.js):
 *   the global value, the per-project exceptions, and the text block for the
 *   project instructions. The devops Home pane's Einstellungen tab reads
 *   `list --json` and writes with `set`.
 *
 *   Usage:
 *     node thread-location.js list [--json]
 *     node thread-location.js set <local-first|local-only|cloud-first|ask|inherit> [--project <chan_id>] [--json]
 *     node thread-location.js block [--project <chan_id>] [--json]
 *
 *   `inherit` (only with --project) removes that project's exception.
 *   `block` prints the text for the value in effect; for cloud-first there is
 *   none and the output says the block must be removed from the project
 *   instructions. Exit 0 on success, 1 on a usage or validation error.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const lib = require('../hooks/lib/thread-location');

const LABELS = { 'local-first': 'Local first', 'local-only': 'Local only', 'cloud-first': 'Cloud first', ask: 'Ask each time' };

/** The ids devops has seen (+ optional names) from ~/.claude/devops-thread-seen.json; read-only. */
function seenProjects(o = {}) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(o.home || os.homedir(), '.claude', 'devops-thread-seen.json'), 'utf8'));
    const ids = d && d.projects && typeof d.projects === 'object' ? Object.keys(d.projects) : [];
    const names = d && d.projectNames && typeof d.projectNames === 'object' ? d.projectNames : {};
    return { ids, names };
  } catch {
    return { ids: [], names: {} };
  }
}

function listData(o = {}) {
  const stored = lib.read(o);
  const seen = seenProjects(o);
  const ids = [...new Set([...seen.ids, ...Object.keys(stored.projects)])].filter(lib.isProjectId);
  return {
    values: lib.VALUES.map((id) => ({ id, label: LABELS[id] })),
    default: lib.DEFAULT,
    global: stored.global,
    blockVersion: lib.BLOCK_VERSION,
    projects: ids.map((id) => {
      const e = lib.effective(id, o);
      return { id, name: typeof seen.names[id] === 'string' ? seen.names[id] : '', value: e.value, source: e.source };
    }),
  };
}

function setLocation(value, project, o = {}) {
  lib.set(value, { project }, o);
  return listData(o);
}

function blockData(project, o = {}) {
  const e = lib.effective(project, o);
  return { value: e.value, source: e.source, marker: lib.marker(e.value), block: lib.block(e.value, o) };
}

function fail(msg) {
  process.stderr.write(`[thread-location] ${msg}\n`);
  process.exit(1);
}

function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--') && a !== '--project'));
  let project;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') {
      project = argv[++i];
      if (!project) fail('--project needs a project id (chan_…)');
    } else if (!argv[i].startsWith('--')) rest.push(argv[i]);
  }
  const [cmd, arg] = rest;
  const json = flags.has('--json');
  const out = (s) => process.stdout.write(s + '\n');
  try {
    if (cmd === 'list') {
      const d = listData();
      if (json) out(JSON.stringify(d));
      else {
        out(`thread location: ${d.global} (default ${d.default})\nvalues: ${d.values.map((v) => v.id).join(', ')}`);
        for (const p of d.projects) out(`${p.id}${p.name ? ` (${p.name})` : ''}: ${p.value} [${p.source}]`);
      }
    } else if (cmd === 'set') {
      if (!arg) fail(`usage: set <${[...lib.VALUES, lib.INHERIT].join('|')}> [--project <chan_id>] (valid values: ${lib.VALUES.join(', ')}; inherit only with --project)`);
      if (arg.toLowerCase() === lib.INHERIT && !project) fail(`"inherit" needs --project <chan_id>; valid global values: ${lib.VALUES.join(', ')}`);
      const d = setLocation(arg, project);
      if (json) out(JSON.stringify(d));
      else out(project ? `${project}: ${lib.effective(project).value}` : `threadLocation.default = ${d.global}`);
    } else if (cmd === 'block') {
      if (project && !lib.isProjectId(project)) fail(`malformed project id "${project}" — expected chan_<id>`);
      const d = blockData(project);
      if (d.value !== 'cloud-first' && !d.block) fail(`no text block for "${d.value}" in deep-knowledge/project-instructions-snippet.md`);
      if (json) out(JSON.stringify(d));
      else if (d.block) out(d.block);
      else out('cloud-first has no text block: remove the "Where threads run" block from the project instructions.');
    } else {
      fail('usage: list [--json] | set <value|inherit> [--project <chan_id>] [--json] | block [--project <chan_id>] [--json]');
    }
  } catch (e) {
    fail(e.message);
  }
}

if (require.main === module) main();

module.exports = { listData, setLocation, blockData, seenProjects };
