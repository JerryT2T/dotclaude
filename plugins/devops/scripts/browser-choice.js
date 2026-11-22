#!/usr/bin/env node
/**
 * @script browser-choice
 * @version 0.1.0
 * @plugin devops
 * @description The browser devops opens pages in (hooks/lib/browser-choice.js):
 *   what is installed, what is chosen, and the open itself. The devops Home
 *   pane's Einstellungen tab reads `list --json` and writes with `set`.
 *
 *   Usage:
 *     node browser-choice.js list [--json]
 *     node browser-choice.js set <auto|in-app|edge|chrome|…>    (machine-wide; only an installed browser)
 *     node browser-choice.js open <url> [--min] [--external]
 *
 *   `open` prints one JSON line. In-app has no process to start: it prints
 *   {"ok":true,"open_in":"pane","url":…} and the caller opens the URL with the
 *   Desktop app's browser pane tools. `--external` opens it outside the app
 *   instead (the first installed browser, else the OS default).
 *   Exit 0 on success, 1 on a usage or validation error.
 */

'use strict';

const { spawn } = require('child_process');
const lib = require('../hooks/lib/browser-choice');

function listData(o = {}) {
  const b = lib.resolveBrowser(o);
  return { effective: { id: b.id, label: b.label }, stored: b.stored, options: b.options };
}

/**
 * Store the choice machine-wide. Only what the Home pane would offer is
 * accepted: auto, in-app, or an installed browser.
 * @throws {Error} unknown or not installed
 */
function setChoice(id, o = {}) {
  const value = String(id || '').trim().toLowerCase();
  if (!lib.SETTING_VALUES.includes(value)) throw new Error(`unknown browser "${id}" — valid: ${lib.SETTING_VALUES.join(', ')}`);
  const installed = o.installed || lib.installedBrowsers(o);
  if (value !== lib.AUTO && value !== lib.IN_APP && !installed.some((b) => b.id === value)) {
    throw new Error(`${value} is not installed on this machine — installed: ${installed.map((b) => b.id).join(', ') || 'none'}`);
  }
  require('../hooks/lib/devops-config').setValue('browser.default', value, 'global', o.cwd, { home: o.home });
  return listData({ ...o, installed, stored: value });
}

/**
 * The spawn for `open`, or null when the page belongs in the Desktop app's pane.
 * @returns {{cmd:string, args:string[], verbatim:boolean}|null}
 */
function openPlan(url, { minimized = false, external = false, ...o } = {}) {
  const b = lib.resolveBrowser(o);
  const platform = o.platform || process.platform;
  const cmd = lib.openCommand(b, url, { platform, minimized });
  if (cmd) return cmd;
  if (!external) return null;
  return lib.openCommand(b.installed[0], url, { platform, minimized }) || lib.systemOpenCommand(url, platform);
}

function open(url, opts) {
  const plan = openPlan(url, opts);
  if (!plan) return { ok: true, open_in: 'pane', url };
  try {
    spawn(plan.cmd, plan.args, lib.spawnOptions(plan)).on('error', () => {}).unref();
    return { ok: true, open_in: 'external', url };
  } catch (e) {
    return { ok: false, error: e.message, url };
  }
}

function fail(msg) {
  process.stderr.write(`[browser-choice] ${msg}\n`);
  process.exit(1);
}

function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const [cmd, arg] = argv.filter((a) => !a.startsWith('--'));
  try {
    if (cmd === 'list') {
      const d = listData();
      if (flags.has('--json')) process.stdout.write(JSON.stringify(d) + '\n');
      else process.stdout.write(`browser: ${d.effective.label} (${d.effective.id}; stored: ${d.stored})\noptions: ${d.options.map((o) => o.id).join(', ')}\n`);
    } else if (cmd === 'set') {
      if (!arg) fail('usage: set <auto|in-app|browser id>');
      const d = setChoice(arg);
      process.stdout.write(flags.has('--json') ? JSON.stringify(d) + '\n' : `browser.default = ${d.stored} → ${d.effective.label}\n`);
    } else if (cmd === 'open') {
      if (!arg || !/^(?:https?|file):\/\//i.test(arg)) fail('usage: open <http(s):// or file:// url> [--min] [--external]');
      const r = open(arg, { minimized: flags.has('--min'), external: flags.has('--external') });
      process.stdout.write(JSON.stringify(r) + '\n');
      if (!r.ok) process.exit(1);
    } else {
      fail('usage: list [--json] | set <auto|in-app|browser id> | open <url> [--min] [--external]');
    }
  } catch (e) {
    fail(e.message);
  }
}

if (require.main === module) main();

module.exports = { listData, setChoice, openPlan };
