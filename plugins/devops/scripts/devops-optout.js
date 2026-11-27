#!/usr/bin/env node
'use strict';
/**
 * @module devops-optout
 * @version 0.1.0
 * @plugin devops
 * @description Switch devops off / on for this session or this project —
 *   the prompt path behind "devops aus für dieses Projekt" (the band popup
 *   writes the same switches; contract in lib/devops-optout.js).
 *
 *   node devops-optout.js off|on|status --scope session|project
 *        [--session <id>] [--cwd <dir>] [--json]
 *
 *   project OFF: `.claude/settings.local.json` (git-ignored, never
 *   settings.json) gets enabledPlugins["devops@dotclaude"]=false. The output
 *   style is left alone (it is its own setting, scripts/output-style.js).
 *   project ON: our false is removed; if the resolver still says off (team
 *   settings.json false) an explicit true goes into settings.local.json.
 *   An old `.claude/devops-optout.json` memo (older versions wrote
 *   outputStyle="default" on off) is still honoured once on ON, then deleted.
 *   session: a flag file. global ("Alle Projekte"): the flag file
 *   `~/.claude/devops-optout/global.json`; hooks/skills/MCP rest, Home stays.
 *   Exit 0 ok, 2 bad args.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const O = require('../hooks/lib/devops-optout');
const { projectClaudeDir } = require('../hooks/lib/project-root');

const KEY = 'devops@dotclaude';
const DAY = 86400000;

function readJson(f) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^[\ufeff]/, '')); } catch { return null; }
}
function writeJson(f, o) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n');
}

function sweep(home) {
  const dir = path.dirname(O.sessionFlagPath(home, 'x'));
  try {
    for (const n of fs.readdirSync(dir)) {
      const f = path.join(dir, n);
      try { if (Date.now() - fs.statSync(f).mtimeMs > 7 * DAY) fs.unlinkSync(f); } catch { /* best effort */ }
    }
  } catch { /* no dir */ }
}

function run({ action, scope, session, cwd, home = os.homedir(), pluginRoot = process.env.CLAUDE_PLUGIN_ROOT }) {
  cwd = cwd || process.cwd();
  const claudeDir = projectClaudeDir(cwd);
  const root = path.dirname(claudeDir);
  const local = path.join(claudeDir, 'settings.local.json');
  const memoFile = path.join(claudeDir, 'devops-optout.json');
  const res = (state, extra = {}) => ({ state, scope, ...extra });

  if (scope === 'global') {
    const f = O.globalFlagPath(home);
    if (action === 'off') { writeJson(f, { off: true, at: new Date().toISOString() }); return res('off', { file: f }); }
    if (action === 'on') { try { fs.unlinkSync(f); } catch { /* none */ } return res('on', { file: f }); }
    return res(fs.existsSync(f) ? 'off' : 'on', { file: f });
  }

  if (scope === 'session') {
    if (!session) throw Object.assign(new Error('--session <id> required for --scope session'), { bad: true });
    const f = O.sessionFlagPath(home, session);
    if (action === 'off') {
      sweep(home);
      writeJson(f, { off: true, at: new Date().toISOString(), cwd: root });
      return res('off', { file: f });
    }
    if (action === 'on') { try { fs.unlinkSync(f); } catch { /* none */ } return res('on', { file: f }); }
    return res(fs.existsSync(f) ? 'off' : 'on', { file: f });
  }

  if (action === 'status') {
    const r = O.resolve({ cwd, sessionId: session, pluginRoot, home });
    return res(r.on ? 'on' : 'off', { resolved: r.scope, file: r.file || null });
  }

  const s = readJson(local) || {};
  if (action === 'off') {
    s.enabledPlugins = { ...(s.enabledPlugins || {}), [KEY]: false };
    writeJson(local, s);
    return res('off', { file: local });
  }
  // on
  if (s.enabledPlugins && typeof s.enabledPlugins === 'object') {
    for (const k of Object.keys(s.enabledPlugins)) if (O.isDevopsKey(k) && s.enabledPlugins[k] === false) delete s.enabledPlugins[k];
    if (!Object.keys(s.enabledPlugins).length) delete s.enabledPlugins;
  }
  const memo = readJson(memoFile); // migration: written by an older off
  if (memo) {
    if (memo.hadLocalOutputStyle && typeof memo.prevOutputStyle === 'string') s.outputStyle = memo.prevOutputStyle;
    else delete s.outputStyle;
    try { fs.unlinkSync(memoFile); } catch { /* gone */ }
  }
  const persist = () => { if (Object.keys(s).length || fs.existsSync(local)) writeJson(local, s); };
  persist();
  if (!O.resolve({ cwd, pluginRoot, home }).on) { // a team settings.json false still wins: say true explicitly
    s.enabledPlugins = { ...(s.enabledPlugins || {}), [KEY]: true };
    persist();
  }
  if (session) { try { fs.unlinkSync(O.sessionFlagPath(home, session)); } catch { /* none */ } }
  return res('on', { file: local });
}

function parseArgs(argv) {
  const a = { action: argv[0], scope: 'project', json: false };
  for (let i = 1; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--json') a.json = true;
    else if (t === '--scope') a.scope = argv[++i];
    else if (t === '--session') a.session = argv[++i];
    else if (t === '--cwd') a.cwd = argv[++i];
    else return null;
  }
  if (!['off', 'on', 'status'].includes(a.action) || !['session', 'project', 'global'].includes(a.scope)) return null;
  return a;
}

function main(argv) {
  const a = parseArgs(argv);
  if (!a) { process.stderr.write('usage: devops-optout.js off|on|status --scope session|project|global [--session <id>] [--cwd <dir>] [--json]\n'); return 2; }
  try {
    const r = run(a);
    const rel = r.file ? path.relative(a.cwd || process.cwd(), r.file) || r.file : '';
    process.stdout.write((a.json ? JSON.stringify(r) : `devops ${r.state} (${r.scope})${rel ? ` · ${rel}` : ''}`) + '\n');
    return 0;
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    return e.bad ? 2 : 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { run, main, parseArgs, KEY };
