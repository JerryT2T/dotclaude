'use strict';
/**
 * @module browser-choice
 * @version 0.1.0
 * @plugin devops
 * @description Which browser shows the pages devops opens for the user (concept
 *   pages, re-opened session files, guide tabs): the setting `browser.default`
 *   (hooks/lib/devops-config.js, machine-wide), resolved against what is
 *   installed. The devops Home pane's Einstellungen tab offers the installed
 *   ones plus "In-App" (the Desktop app's browser pane).
 *
 *   Resolution:
 *     in-app                    → in-app
 *     a browser id, installed   → that browser
 *     auto, or an id that is no longer installed
 *                               → Edge when installed, else the first installed
 *                                 one (BROWSERS order), else in-app
 *
 *   Pure fs — no registry query, no process spawn: hooks call this.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const IN_APP = 'in-app';
const AUTO = 'auto';

/**
 * Every browser the setting knows, Edge first (the order `auto` falls through).
 * `win`: paths below %ProgramFiles%, %ProgramFiles(x86)% and %LocalAppData%.
 * `start`: the App Paths alias `start` resolves on its own (Edge keeps the
 * command the plugin always used). `mac`: the .app name. `linux`: binaries on PATH.
 */
const BROWSERS = Object.freeze([
  { id: 'edge', label: 'Microsoft Edge', win: ['Microsoft\\Edge\\Application\\msedge.exe'], start: 'msedge', mac: 'Microsoft Edge', linux: ['microsoft-edge', 'microsoft-edge-stable'] },
  { id: 'chrome', label: 'Google Chrome', win: ['Google\\Chrome\\Application\\chrome.exe'], mac: 'Google Chrome', linux: ['google-chrome', 'google-chrome-stable'] },
  { id: 'firefox', label: 'Mozilla Firefox', win: ['Mozilla Firefox\\firefox.exe'], mac: 'Firefox', linux: ['firefox'] },
  { id: 'brave', label: 'Brave', win: ['BraveSoftware\\Brave-Browser\\Application\\brave.exe'], mac: 'Brave Browser', linux: ['brave-browser', 'brave'] },
  { id: 'vivaldi', label: 'Vivaldi', win: ['Vivaldi\\Application\\vivaldi.exe'], mac: 'Vivaldi', linux: ['vivaldi', 'vivaldi-stable'] },
  { id: 'opera', label: 'Opera', win: ['Programs\\Opera\\opera.exe', 'Opera\\opera.exe'], mac: 'Opera', linux: ['opera'] },
].map(Object.freeze));

const IN_APP_LABEL = 'In-App (Claude Desktop)';

/** Every value `browser.default` accepts. */
const SETTING_VALUES = Object.freeze([AUTO, ...BROWSERS.map((b) => b.id), IN_APP]);

function isFile(p, stat = fs.statSync) {
  try { return stat(p).isFile(); } catch { return false; }
}

/**
 * The executable (Windows, Linux) or .app bundle (macOS) of one browser, or ''.
 * @param {object} b BROWSERS entry
 * @param {{platform?:string, env?:object, home?:string, exists?:(p:string)=>boolean}} [o]
 */
function locate(b, o = {}) {
  const platform = o.platform || process.platform;
  const env = o.env || process.env;
  const exists = o.exists || ((p) => (platform === 'darwin' ? fs.existsSync(p) : isFile(p)));
  if (platform === 'win32') {
    const roots = [env.PROGRAMFILES || 'C:\\Program Files', env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', env.LOCALAPPDATA].filter(Boolean);
    for (const root of roots) {
      for (const rel of b.win) {
        const p = path.win32.join(root, rel);
        if (exists(p)) return p;
      }
    }
    return '';
  }
  if (platform === 'darwin') {
    const home = o.home || os.homedir();
    for (const dir of ['/Applications', path.posix.join(home, 'Applications')]) {
      const p = path.posix.join(dir, `${b.mac}.app`);
      if (exists(p)) return p;
    }
    return '';
  }
  for (const dir of String(env.PATH || '').split(':').filter(Boolean)) {
    for (const bin of b.linux) {
      const p = path.posix.join(dir, bin);
      if (exists(p)) return p;
    }
  }
  return '';
}

/**
 * The installed browsers, in BROWSERS order.
 * @returns {Array<{id:string, label:string, exe:string}>}
 */
function installedBrowsers(o = {}) {
  const out = [];
  for (const b of BROWSERS) {
    const exe = locate(b, o);
    if (exe) out.push({ id: b.id, label: b.label, exe });
  }
  return out;
}

/** The stored `browser.default` (machine-wide), `auto` when unset or unreadable. */
function storedChoice(o = {}) {
  try {
    const v = require('./devops-config').load(o.cwd, { home: o.home }).values.browser.default;
    return SETTING_VALUES.includes(v) ? v : AUTO;
  } catch {
    return AUTO;
  }
}

/**
 * The browser in effect.
 * @param {{stored?:string, installed?:Array, cwd?:string, home?:string, platform?:string, env?:object, exists?:Function}} [o]
 * @returns {{id:string, label:string, exe:string, stored:string, installed:Array<{id:string,label:string,exe:string}>, options:Array<{id:string,label:string}>}}
 */
function resolveBrowser(o = {}) {
  const installed = o.installed || installedBrowsers(o);
  const stored = o.stored || storedChoice(o);
  const options = [...installed.map((b) => ({ id: b.id, label: b.label })), { id: IN_APP, label: IN_APP_LABEL }];
  let hit = null;
  if (stored !== IN_APP) hit = installed.find((b) => b.id === stored) || installed[0] || null;
  // `fallback`: in-app only because nothing is installed — a script without a
  // pane (the concept waker) then uses the OS opener instead of opening nothing.
  return hit
    ? { id: hit.id, label: hit.label, exe: hit.exe, stored, installed, options }
    : { id: IN_APP, label: IN_APP_LABEL, exe: '', stored, installed, options, fallback: stored !== IN_APP };
}

/**
 * URLs `cmd /c start` can take as they are. Anything else — a quote, `%VAR%`,
 * `&`, `^`, a space — would be read by cmd as syntax (a `"` closes the quoting,
 * `%CD%` expands even inside it), so those start the executable directly.
 */
const CMD_SAFE_URL = /^[A-Za-z0-9:/?#@$'*+,;=._~()[\]-]+$/;

/** The OS opener for whatever handles the URL (no browser of ours to name). */
function systemOpenCommand(url, platform = process.platform) {
  if (platform === 'win32') {
    return CMD_SAFE_URL.test(url)
      ? { cmd: 'cmd.exe', args: ['/c', 'start', '""', `"${url}"`], verbatim: true }
      : { cmd: 'explorer.exe', args: [url], verbatim: false, show: true };
  }
  if (platform === 'darwin') return { cmd: 'open', args: [url], verbatim: false };
  return { cmd: 'xdg-open', args: [url], verbatim: false };
}

/**
 * The spawn that opens `url` in `browser` (a resolveBrowser() result or an
 * installedBrowsers() entry). Windows goes through `start` so the launcher
 * returns at once; `minimized` adds `/min` there (best effort, Windows only).
 * Spawn with `spawnOptions(plan)`.
 * @returns {{cmd:string, args:string[], verbatim:boolean, show?:boolean}|null} null for in-app: no process can open the Desktop app's pane
 */
function openCommand(browser, url, { platform = process.platform, minimized = false } = {}) {
  if (!browser || browser.id === IN_APP) return null;
  const def = BROWSERS.find((b) => b.id === browser.id);
  if (!def) return null;
  if (platform === 'win32') {
    // No shell for a URL cmd would misread: the executable takes it as one argument.
    if (!CMD_SAFE_URL.test(url)) return browser.exe ? { cmd: browser.exe, args: [url], verbatim: false, show: true } : null;
    const target = def.start || `"${browser.exe}"`;
    return { cmd: 'cmd.exe', args: ['/c', 'start', '""', ...(minimized ? ['/min'] : []), target, `"${url}"`], verbatim: true };
  }
  if (platform === 'darwin') return { cmd: 'open', args: ['-a', def.mac, url], verbatim: false };
  return { cmd: browser.exe || def.linux[0], args: [url], verbatim: false };
}

/** The spawn options for an openCommand() / systemOpenCommand() plan: detached, silent, the browser's own window shown. */
function spawnOptions(plan) {
  return { detached: true, stdio: 'ignore', windowsHide: !plan.show, windowsVerbatimArguments: !!plan.verbatim };
}

/**
 * The one-line `[browser] …` state for SessionStart, or '' while Edge is in
 * effect (the plugin's docs already say Edge).
 */
function browserLine(o = {}) {
  let b;
  try { b = resolveBrowser(o); } catch { return ''; }
  if (b.id === 'edge') return '';
  const why = b.stored === b.id ? 'chosen in devops Home' : b.stored === AUTO ? 'Edge is not installed' : `"${b.stored}" is not installed`;
  return b.id === IN_APP
    ? `[browser] in-app (${why}) — pages for the user open in the Desktop app's browser pane, not in Edge; rules: browser-tool-strategy.md § The user's browser.`
    : `[browser] ${b.label} (${why}) — use it wherever a devops doc says Edge/msedge; rules: browser-tool-strategy.md § The user's browser.`;
}

module.exports = {
  BROWSERS, SETTING_VALUES, IN_APP, AUTO, IN_APP_LABEL,
  locate, installedBrowsers, storedChoice, resolveBrowser, openCommand, systemOpenCommand, spawnOptions, browserLine,
};
