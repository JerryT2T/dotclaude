#!/usr/bin/env node
'use strict';
/**
 * concept-open.js - the mechanical part of opening a concept page, in two phases.
 *
 *   prepare --cwd <session cwd> --html <rel html> [--slug <s>]
 *     Picks a registry-safe port, claims it, writes <cwd>/.claude/concept-active.json
 *     (fresh owner token), captures the drift baseline and prints
 *     {port, owner, state, url, launch:{server,pulser,waker}} as JSON.
 *     The three launch commands MUST be started by the model as Bash-tool
 *     background tasks (run_in_background: true); a child spawned here would
 *     die with this call (bridge-server.md step 2).
 *
 *   verify --state <abs state file>
 *     Heartbeat round-trip (claude_ts must advance), 200 gate on the page URL,
 *     then opens Edge (Windows: start "" msedge <url>). Prints {ok:true,url} or
 *     {ok:false,error} and exits 1. CONCEPT_OPEN_NO_BROWSER=1 skips the open.
 *
 * Every sibling script is resolved from this file's directory.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');

const DIR = __dirname;
const fwd = (p) => String(p).replace(/\\/g, '/');
const q = (p) => `"${fwd(p)}"`;

function runNode(script, args) {
  return spawnSync(process.execPath, [path.join(DIR, script), ...args], { encoding: 'utf8', timeout: 60000 });
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    o[argv[i].slice(2)] = next !== undefined && !next.startsWith('--') ? argv[++i] : true;
  }
  return o;
}

function buildLaunch({ port, cwd, html, state, owner }) {
  const watch = (mode) => `node ${q(path.join(DIR, 'concept-watch.js'))} --mode ${mode} --port ${port} --state ${q(state)} --owner ${owner}`;
  return {
    server: `python ${q(path.join(DIR, 'concept-server.py'))} ${port} ${q(cwd)} --html ${q(html)}`,
    pulser: watch('pulse'),
    waker: watch('watch'),
  };
}

function prepare(opts, deps = {}) {
  const run = deps.runNode || runNode;
  if (!opts.cwd || !opts.html || opts.html === true) throw new Error('prepare needs --cwd <dir> and --html <relative path>');
  const cwd = path.resolve(opts.cwd);
  const html = fwd(opts.html);
  if (path.isAbsolute(html) || html.split('/').includes('..')) throw new Error(`--html must be relative to --cwd, got ${html}`);
  if (!fs.existsSync(path.join(cwd, html))) throw new Error(`concept HTML not found: ${path.join(cwd, html)}`);

  const pick = run('concept-port-registry.js', ['pick', cwd]);
  const port = Number(String(pick.stdout || '').trim());
  if (pick.status !== 0 || !Number.isInteger(port) || port <= 0) {
    throw new Error(`port pick failed: ${String(pick.stderr || pick.stdout || 'no output').trim()}`);
  }
  const claim = run('concept-port-registry.js', ['can-claim', String(port), cwd]);
  if (claim.status !== 0) throw new Error(`port ${port} is owned by another live session - re-run prepare`);

  const owner = crypto.randomBytes(4).toString('hex');
  const state = fwd(path.join(cwd, '.claude', 'concept-active.json'));
  const slug = opts.slug || path.basename(html, '.html').replace(/^\d{4}-\d{2}-\d{2}-/, '');
  fs.mkdirSync(path.dirname(state), { recursive: true });
  fs.writeFileSync(state, JSON.stringify({
    port, html_path: html, slug, owner, started_at: new Date().toISOString(),
  }, null, 2) + '\n');

  // Never blocks: no remote / no repo just means no baseline (gate skips).
  const cap = run('concept-drift.js', ['--capture', '--state', state]);
  let baseline;
  try { baseline = JSON.parse(String(cap.stdout || '')); } catch { baseline = undefined; }

  return {
    port, owner, state, url: `http://localhost:${port}/${html}`,
    launch: buildLaunch({ port, cwd, html, state, owner }),
    baseline,
  };
}

function req(method, url, timeout = 3000) {
  return new Promise((resolve) => {
    const r = http.request(url, { method, timeout }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: '' }); });
    r.on('error', () => resolve({ status: 0, body: '' }));
    r.end();
  });
}

async function claudeTs(base) {
  const r = await req('GET', `${base}/heartbeat`);
  if (r.status !== 200) return null;
  try { return Number(JSON.parse(r.body).claude_ts) || 0; } catch { return null; }
}

function openBrowser(url) {
  if (process.env.CONCEPT_OPEN_NO_BROWSER === '1') return null;
  let cmd; let args;
  if (process.platform === 'win32') { cmd = 'cmd.exe'; args = ['/c', 'start', '""', 'msedge', url]; }
  else if (process.platform === 'darwin') { cmd = 'open'; args = ['-a', 'Microsoft Edge', url]; }
  else { cmd = 'microsoft-edge'; args = [url]; }
  return new Promise((resolve) => {
    const c = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: true });
    c.on('error', (e) => resolve(`could not open Edge (${cmd}): ${e.message}`));
    c.on('exit', (code) => resolve(code ? `${cmd} exited with ${code}` : null));
    c.unref();
  });
}

async function verify(opts, deps = {}) {
  const open = deps.openBrowser || openBrowser;
  const waitMs = deps.waitMs === undefined ? 20000 : deps.waitMs;
  if (!opts.state || opts.state === true) return { ok: false, error: 'verify needs --state <abs path>' };
  let st;
  try { st = JSON.parse(fs.readFileSync(opts.state, 'utf8')); } catch (e) {
    return { ok: false, error: `cannot read state file ${opts.state}: ${e.message}` };
  }
  if (!st.port || !st.html_path) return { ok: false, error: `state file lacks port/html_path: ${opts.state}` };
  const base = `http://localhost:${st.port}`;
  const url = `${base}/${st.html_path}`;

  // The bridge may still be booting: wait for the first heartbeat answer.
  const deadline = Date.now() + waitMs;
  let pre = await claudeTs(base);
  while (pre === null && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    pre = await claudeTs(base);
  }
  if (pre === null) return { ok: false, error: `bridge on port ${st.port} does not answer /heartbeat - is the server task running?` };
  await req('POST', `${base}/heartbeat`);
  const post = await claudeTs(base);
  if (post === null || post <= pre) {
    return { ok: false, error: `bridge on port ${st.port} did not advance claude_ts (${pre} -> ${post})` };
  }
  const page = await req('GET', url);
  if (page.status !== 200) {
    return { ok: false, error: `concept URL ${url} -> HTTP ${page.status} (expected 200); the server cwd must contain ${st.html_path}`, url };
  }
  const err = await open(url);
  if (err) return { ok: false, error: err, url };
  return { ok: true, url };
}

module.exports = { prepare, verify, buildLaunch, parseArgs, openBrowser };

if (require.main === module) {
  (async () => {
    const [cmd, ...rest] = process.argv.slice(2);
    const opts = parseArgs(rest);
    try {
      if (cmd === 'prepare') {
        process.stdout.write(JSON.stringify(prepare(opts)) + '\n');
      } else if (cmd === 'verify') {
        const res = await verify(opts);
        process.stdout.write(JSON.stringify(res) + '\n');
        process.exit(res.ok ? 0 : 1);
      } else {
        process.stderr.write('usage: concept-open.js prepare --cwd <dir> --html <rel> | verify --state <abs path>\n');
        process.exit(2);
      }
    } catch (e) {
      process.stdout.write(JSON.stringify({ ok: false, error: e.message }) + '\n');
      process.exit(1);
    }
  })();
}
