#!/usr/bin/env node
'use strict';
/**
 * @module output-style
 * @version 0.1.0
 * @plugin devops
 * @description The output style as its own setting, independent of devops on/off
 *   (Home › Einstellungen › Ausgabestil). One user-level choice for all projects:
 *   `outputStyle` in `~/.claude/settings.json`.
 *
 *   node output-style.js get [--json]
 *   node output-style.js set Quiet|default [--json]
 *
 *   `set Quiet` also installs `~/.claude/output-styles/quiet.md` from the shipped
 *   template when it is missing (the style is selectable only with that file).
 *   `set default` removes the key — Claude Code's default style then applies.
 *   Only `outputStyle` is touched; every other key of the settings file stays.
 *   A new session picks the change up (`takesEffect: 'new-session'` in the result
 *   when the value changed, null otherwise — say it only when it changed).
 *   Corrupt settings are never overwritten (exit 1). Exit 0 ok, 2 bad args.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { syncQuietStyle } = require('../hooks/lib/output-style-sync');

const PLUGIN_DIR = path.resolve(__dirname, '..');

function settingsFile(home) { return path.join(home, '.claude', 'settings.json'); }

/** The user-level style as 'Quiet' | 'default' | <other string the user chose>. Unset = 'default'. */
function normalize(v) {
  if (typeof v !== 'string' || !v.trim() || v.trim().toLowerCase() === 'default') return 'default';
  return v.trim().toLowerCase() === 'quiet' ? 'Quiet' : v.trim();
}

function readSettings(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8').replace(/^[﻿]/, ''); } catch { return {}; }
  if (!text.trim()) return {};
  const v = JSON.parse(text); // throws on corrupt: never clobber the person's file
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('settings.json is not a JSON object');
  return v;
}

function get({ home = os.homedir() } = {}) {
  let style = 'default';
  try { style = normalize(readSettings(settingsFile(home)).outputStyle); } catch { /* corrupt: report default, change nothing */ }
  return { style };
}

function set(style, { home = os.homedir(), pluginDir = PLUGIN_DIR } = {}) {
  const want = normalize(style);
  if (want !== 'Quiet' && want !== 'default') throw Object.assign(new Error('style must be Quiet or default'), { bad: true });
  const file = settingsFile(home);
  const s = readSettings(file);
  const before = normalize(s.outputStyle);
  if (want === 'Quiet') s.outputStyle = 'Quiet'; else delete s.outputStyle;
  const changed = before !== want;
  if (changed) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
  }
  if (want === 'Quiet') syncQuietStyle({ home, pluginDir, cwd: home });
  return { style: want, changed, takesEffect: changed ? 'new-session' : null };
}

function main(argv) {
  const json = argv.includes('--json');
  const rest = argv.filter((a) => a !== '--json');
  const [action, value] = rest;
  const usage = () => { process.stderr.write('usage: output-style.js get | set Quiet|default [--json]\n'); return 2; };
  if (rest.length > 2 || (action !== 'get' && action !== 'set') || (action === 'get' && rest.length !== 1) || (action === 'set' && !value)) return usage();
  try {
    const r = action === 'get' ? get() : set(value);
    process.stdout.write((json ? JSON.stringify(r) : `output style: ${r.style}${r.takesEffect ? ' (applies to new sessions)' : ''}`) + '\n');
    return 0;
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    return e.bad ? 2 : 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { get, set, main, normalize };
