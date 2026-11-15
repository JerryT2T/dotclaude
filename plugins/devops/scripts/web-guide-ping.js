#!/usr/bin/env node
/**
 * @script web-guide-ping
 * @version 0.2.0
 * @description Zero-token wake channel for `/auto-guide` (protocol.md
 *   § Sleeping). After ~10 min without a panel event the skill puts the guide
 *   to sleep instead of long-polling: the overlay gets the guide's ping key,
 *   Claude starts `listen --guide` with `run_in_background` and ends its turn.
 *   A panel click with nobody polling launches `claude-guide://ping/<key>/`,
 *   Windows hands it to the per-user protocol handler (`handle`), the handler
 *   drops a marker file, `listen` exits — and that re-invokes the idle
 *   session. The ping carries no data: Claude still drains the event from the
 *   overlay queue with `javascript_tool`.
 *
 *   Windows only (HKCU registration, no admin). In the Claude desktop app
 *   (MSIX) run `install` from the PowerShell tool: processes the Bash tool
 *   starts see a virtualized HKCU\Software\Classes that Edge never reads.
 *   Zero dependencies, CommonJS.
 *
 * Commands:
 *   install            → copies this file to the state dir and registers the
 *     `claude-guide:` scheme under HKCU\Software\Classes (hidden launch via
 *     `conhost.exe --headless`; `FriendlyAppName` makes Edge's one-time
 *     dialog say „Claude Webguide")
 *   uninstall          → removes the registry key (state dir is left alone)
 *   status             → JSON {command, armed}: the registered command or null
 *   key                → prints a fresh random key (32 hex chars)
 *   listen <key>|--guide [--hours N]
 *                      → arms the key (`--guide`: the active guide's ping key
 *     from `<cwd>/.claude/auto-guide-active.json`), blocks until a ping for it
 *     arrives, prints `PING <key>` and exits 0; `TIMEOUT <key>` exit 3 after N
 *     hours (default 24); `DISARMED <key>` exit 4 once the arm file is gone
 *     (the guide resumed another way). A ping that arrived before `listen`
 *     started is consumed at once.
 *   arm <key> / disarm <key>
 *                      → create / remove the arm file; pings for an unarmed
 *     key are dropped
 *   handle <url>       → the protocol handler entry point. Writes the ping
 *     marker only when <key> is armed (an unarmed or malformed URL is a silent
 *     no-op — any website can launch the scheme, but cannot guess a key).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const SCHEME = 'claude-guide';
const KEY_RE = /^[a-f0-9]{32}$/;
const URL_RE = /^claude-guide:\/\/ping\/([a-f0-9]{32})\/?$/i;
const ARM_TTL_MS = 48 * 3600 * 1000;
const POLL_MS = 2000;

function stateDir() {
  // Not under AppData: the Claude desktop app is MSIX-packaged, and processes
  // it spawns may see a per-package virtualized AppData/HKCU\Software. The
  // handler runs outside that container (Edge launches it), so the listener
  // and the handler only meet on a path MSIX does not redirect.
  return process.env.WEB_GUIDE_PING_DIR || path.join(os.homedir(), '.dotclaude', 'web-guide');
}

function pingDir() {
  return path.join(stateDir(), 'pings');
}

function armFile(key) {
  return path.join(pingDir(), `${key}.armed`);
}

function pingFile(key) {
  return path.join(pingDir(), `${key}.ping`);
}

function parseUrl(url) {
  if (typeof url !== 'string' || url.length > 200) return null;
  const m = URL_RE.exec(url.trim());
  return m ? m[1].toLowerCase() : null;
}

function isArmed(key) {
  try {
    const st = fs.statSync(armFile(key));
    return Date.now() - st.mtimeMs < ARM_TTL_MS;
  } catch {
    return false;
  }
}

function handle(url) {
  const key = parseUrl(url);
  if (!key || !isArmed(key)) return false;
  const tmp = `${pingFile(key)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, String(Date.now()));
  fs.renameSync(tmp, pingFile(key));
  return true;
}

function consume(key) {
  try {
    fs.unlinkSync(pingFile(key));
    return true;
  } catch {
    return false;
  }
}

function arm(key) {
  fs.mkdirSync(pingDir(), { recursive: true });
  fs.writeFileSync(armFile(key), String(Date.now()));
}

function disarm(key) {
  if (!KEY_RE.test(key || '')) return false;
  try {
    fs.unlinkSync(armFile(key));
    return true;
  } catch {
    return false;
  }
}

function listen(key, hours) {
  if (!KEY_RE.test(key || '')) {
    process.stderr.write('listen: key must be 32 lowercase hex chars (use `key`, or --guide)\n');
    process.exitCode = 2;
    return;
  }
  arm(key);
  const deadline = Date.now() + hours * 3600 * 1000;
  let done = false;
  let watcher = null;
  let timer = null;

  function finish(line, code) {
    if (done) return;
    done = true;
    if (watcher) watcher.close();
    clearInterval(timer);
    process.stdout.write(`${line}\n`);
    process.exitCode = code;
  }

  function check() {
    if (consume(key)) {
      finish(`PING ${key}`, 0);
    } else if (!fs.existsSync(armFile(key))) {
      finish(`DISARMED ${key}`, 4);
    } else if (Date.now() > deadline) {
      finish(`TIMEOUT ${key}`, 3);
    }
  }

  try {
    watcher = fs.watch(pingDir(), (_ev, name) => {
      if (name && String(name).startsWith(key)) check();
    });
  } catch {
    // fs.watch is a speed-up only; the interval below is the guarantee.
  }
  timer = setInterval(check, POLL_MS);
  check();
}

function guidePingKey() {
  try {
    return require('./guide-active-state').readPingKey(process.cwd());
  } catch {
    return null;
  }
}

function handlerCommand(target) {
  const conhost = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'conhost.exe');
  return `"${conhost}" --headless "${process.execPath}" "${target}" handle "%1"`;
}

function reg(args) {
  return execFileSync('reg.exe', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function install() {
  if (process.platform !== 'win32') {
    process.stderr.write('install: Windows only\n');
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(pingDir(), { recursive: true });
  const target = path.join(stateDir(), 'web-guide-ping.js');
  fs.copyFileSync(__filename, target);
  const root = `HKCU\\Software\\Classes\\${SCHEME}`;
  reg(['add', root, '/ve', '/d', 'URL:Claude Guide', '/f']);
  reg(['add', root, '/v', 'URL Protocol', '/d', '', '/f']);
  reg(['add', `${root}\\shell\\open`, '/v', 'FriendlyAppName', '/d', 'Claude Webguide', '/f']);
  reg(['add', `${root}\\shell\\open\\command`, '/ve', '/d', handlerCommand(target), '/f']);
  process.stdout.write(`installed ${SCHEME}: → ${target}\n`);
}

function uninstall() {
  try {
    reg(['delete', `HKCU\\Software\\Classes\\${SCHEME}`, '/f']);
    process.stdout.write(`uninstalled ${SCHEME}:\n`);
  } catch {
    process.stdout.write(`not installed ${SCHEME}:\n`);
  }
}

/**
 * The registered handler command, or null (also off Windows). Inside the
 * desktop app's MSIX container this reads the merged view, so a registration
 * written from the Bash tool looks present although Edge cannot see it.
 * @returns {string|null}
 */
function registeredCommand() {
  if (process.platform !== 'win32') return null;
  try {
    const out = reg(['query', `HKCU\\Software\\Classes\\${SCHEME}\\shell\\open\\command`, '/ve']);
    const m = /REG_SZ\s+(.+)/.exec(out);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Whether `install` ran: the handler copy in the state dir. Unlike the
 * registry this is the same file inside and outside the desktop app's MSIX
 * container (the state dir is not under AppData), so the Bash tool can trust
 * it where a registry read would show the container's view.
 * @returns {boolean}
 */
function handlerInstalled() {
  return process.platform === 'win32' && fs.existsSync(path.join(stateDir(), 'web-guide-ping.js'));
}

function status() {
  const command = registeredCommand();
  let armed = [];
  try {
    armed = fs.readdirSync(pingDir()).filter((f) => f.endsWith('.armed')).map((f) => f.slice(0, -6))
      .filter(isArmed);
  } catch {
    // no state dir yet
  }
  process.stdout.write(`${JSON.stringify({ command, armed: armed.length })}\n`);
}

function main(argv) {
  const [cmd, a, ...rest] = argv;
  if (cmd === 'handle') {
    try {
      // Diagnostics: did Edge start the handler at all? One line per launch,
      // never the URL itself; reset once it passes 64 KB.
      const log = path.join(stateDir(), 'handle.log');
      fs.mkdirSync(stateDir(), { recursive: true });
      const big = fs.existsSync(log) && fs.statSync(log).size > 65536;
      fs[big ? 'writeFileSync' : 'appendFileSync'](log, `${new Date().toISOString()} valid=${!!parseUrl(a)}\n`);
    } catch { /* diagnostics only */ }
    try {
      handle(a);
    } catch {
      // never surface anything to the browser — a failed ping is a lost wake;
      // the panel's "schreib im Chat „weiter“" fallback still covers it.
    }
    return;
  }
  if (cmd === 'listen') {
    const i = rest.indexOf('--hours');
    const hours = i >= 0 ? Number(rest[i + 1]) : 24;
    const key = a === '--guide' ? guidePingKey() : a;
    return listen(key, Number.isFinite(hours) && hours > 0 ? hours : 24);
  }
  if (cmd === 'arm') {
    if (!KEY_RE.test(a || '')) { process.exitCode = 2; return; }
    return arm(a);
  }
  if (cmd === 'disarm') {
    disarm(a);
    return;
  }
  if (cmd === 'key') {
    process.stdout.write(`${crypto.randomBytes(16).toString('hex')}\n`);
    return;
  }
  if (cmd === 'install') return install();
  if (cmd === 'uninstall') return uninstall();
  if (cmd === 'status') return status();
  process.stderr.write('usage: web-guide-ping install|uninstall|status|key|listen <key>|--guide [--hours N]|arm <key>|disarm <key>|handle <url>\n');
  process.exitCode = 2;
}

module.exports = { parseUrl, handle, isArmed, arm, disarm, consume, handlerCommand, registeredCommand, handlerInstalled, stateDir };

if (require.main === module) {
  main(process.argv.slice(2));
}
