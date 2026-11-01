'use strict';
/**
 * @module plugin-audit/tokenwaste
 * @version 0.1.0
 * @description The token-waste checks of the plugin audit (#1000), run on the
 *   developer's machine: memory files, MCP tools and deferral, model and
 *   effort, output-filter hooks, subagent models, scheduled work vs the
 *   cache TTL, the cache split of the newest session, and the alpha token
 *   log (#1002). Every check has the integrity shape
 *   { id, title, status, findings, metrics } and never throws. Rules only —
 *   no model is involved.
 *   Project skill of the plugin-source repo - not part of the shipped plugin.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { tokensOfChars, readText, readJson, check, timed } = require('./util');
const { MAX_FILE_BYTES } = require('./mining');

const MEMORY_FILE_RED = 5000;
const MEMORY_TOTAL_RED = 10000;
const SCHEDULED_RUNS_YELLOW = 48;
const PROXY_KEYS = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_BEDROCK_BASE_URL', 'ANTHROPIC_VERTEX_BASE_URL'];

function tokenLogPath(env = process.env, home = os.homedir()) {
  const e = env.DEVOPS_TOKEN_LOG;
  if (e && !/^(off|0|false)$/i.test(e)) return e;
  return path.join(home, '.claude', 'devops-token-log.jsonl');
}

function settingsOf(root, home) {
  return [path.join(home, '.claude', 'settings.json'), path.join(root, '.claude', 'settings.json'), path.join(root, '.claude', 'settings.local.json')]
    .map((f) => ({ file: f, json: readJson(f) })).filter((s) => s.json && typeof s.json === 'object');
}

/** Every CLAUDE.md Claude Code loads for `root`: root and its parents, the user file, one level of @imports. */
function memoryFiles(root, home) {
  const out = [];
  const seen = new Set();
  const add = (f) => {
    const p = path.resolve(f);
    const k = p.toLowerCase();
    if (seen.has(k) || !fs.existsSync(p)) return;
    seen.add(k);
    out.push(p);
  };
  let dir = path.resolve(root);
  for (;;) {
    add(path.join(dir, 'CLAUDE.md'));
    add(path.join(dir, '.claude', 'CLAUDE.md'));
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  add(path.join(home, '.claude', 'CLAUDE.md'));
  for (const f of [...out]) {
    for (const m of String(readText(f) || '').matchAll(/^@(\S+)/gm)) {
      add(m[1].startsWith('~/') ? path.join(home, m[1].slice(2)) : path.resolve(path.dirname(f), m[1]));
    }
  }
  return out;
}

function memory({ root, home }) {
  const files = memoryFiles(root, home).map((f) => ({ file: f, tokens: tokensOfChars((readText(f) || '').length) }));
  const total = files.reduce((n, f) => n + f.tokens, 0);
  const big = files.filter((f) => f.tokens > MEMORY_FILE_RED);
  const status = big.length || total > MEMORY_TOTAL_RED ? 'red' : total > MEMORY_TOTAL_RED * 0.7 ? 'yellow' : 'green';
  const findings = files.map((f) => ({ msg: `~${f.tokens} tok, loaded every session`, file: f.file }));
  if (big.length) findings.unshift({ msg: `${big.length} file(s) over ${MEMORY_FILE_RED} tok` });
  if (total > MEMORY_TOTAL_RED) findings.unshift({ msg: `total ~${total} tok over ${MEMORY_TOTAL_RED}` });
  return check('tw-memory', 'Memory files (CLAUDE.md)', status, findings, { metrics: { files: files.length, totalTokens: total } });
}

function tools({ root, home, env }) {
  const all = {};
  for (const s of settingsOf(root, home)) if (s.json.env && typeof s.json.env === 'object') Object.assign(all, s.json.env);
  for (const k of [...PROXY_KEYS, 'ENABLE_TOOL_SEARCH']) if (env[k] !== undefined) all[k] = env[k];
  // The Desktop app sets ANTHROPIC_BASE_URL to the first-party API itself.
  const firstParty = (u) => { try { return /(^|\.)anthropic\.com$/.test(new URL(u).hostname); } catch { return false; } };
  const proxies = PROXY_KEYS.filter((k) => all[k] && !firstParty(all[k]));
  const toolSearch = all.ENABLE_TOOL_SEARCH;
  const off = /^(false|0)$/i.test(String(toolSearch === undefined ? '' : toolSearch));
  const servers = new Set();
  const cfg = readJson(path.join(home, '.claude.json')) || {};
  for (const k of Object.keys(cfg.mcpServers || {})) servers.add(`user:${k}`);
  const projects = cfg.projects || {};
  const proj = projects[root] || projects[root.replace(/\\/g, '/')];
  for (const k of Object.keys((proj && proj.mcpServers) || {})) servers.add(`project:${k}`);
  for (const k of Object.keys((readJson(path.join(root, '.mcp.json')) || {}).mcpServers || {})) servers.add(`.mcp.json:${k}`);
  const findings = [
    { msg: off ? `tool deferral OFF (ENABLE_TOOL_SEARCH=${toolSearch}) — every MCP tool schema is sent on every call` : `tool deferral on${toolSearch !== undefined ? ` (ENABLE_TOOL_SEARCH=${toolSearch})` : ' (default)'}` },
    ...proxies.map((k) => ({ msg: `${k} is set — behind a proxy or gateway tool deferral can be off; check that MCP tools still load on demand` })),
    { msg: `${servers.size} MCP server(s) configured outside plugins${servers.size ? `: ${[...servers].join(', ')}` : ''}` },
  ];
  const status = off ? 'red' : proxies.length ? 'yellow' : 'green';
  return check('tw-tools', 'MCP tools and deferral', status, findings, { metrics: { servers: servers.size, proxies, deferral: !off } });
}

/** Distinct main-thread models of a transcript, in order, consecutive duplicates collapsed. */
function modelsOf(text) {
  const seen = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.includes('"assistant"') || !line.includes('"model"')) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.type !== 'assistant' || o.isSidechain) continue;
    const m = o.message && o.message.model;
    if (m && m !== '<synthetic>' && seen[seen.length - 1] !== m) seen.push(m);
  }
  return seen;
}

function model({ root, home, env, newest }) {
  const findings = [];
  for (const s of settingsOf(root, home)) {
    if (s.json.model) findings.push({ msg: `model pinned: ${s.json.model}`, file: s.file });
    if (s.json.effortLevel) findings.push({ msg: `effort pinned: ${s.json.effortLevel}`, file: s.file });
  }
  if (env.ANTHROPIC_MODEL) findings.push({ msg: `model pinned by env ANTHROPIC_MODEL=${env.ANTHROPIC_MODEL}` });
  if (!findings.length) findings.push({ msg: 'model and effort: app default (nothing pinned in settings or env)' });
  let status = 'green';
  const models = newest ? modelsOf(newest.text) : [];
  const switches = Math.max(0, models.length - 1);
  if (switches > 0) {
    status = 'yellow';
    findings.push({ msg: `${switches} model switch(es) in the newest session (${models.join(' → ')}) — each switch starts a cold cache`, file: newest.file });
  }
  return check('tw-model', 'Model and effort', status, findings, { metrics: { switches, models } });
}

/** A module that sets `updatedInput:` in code (not only in a comment). */
function rewritesInput(file) {
  return String(readText(file) || '').split('\n').some((l) => !/^\s*(\*|\/\/)/.test(l) && /updatedInput\s*:/.test(l));
}

function hooks({ root, home }) {
  const findings = [];
  let rewriters = 0;
  let plugins = [];
  try { plugins = fs.readdirSync(path.join(root, 'plugins')); } catch { /* not the source repo */ }
  for (const p of plugins) {
    const dir = path.join(root, 'plugins', p, 'hooks', 'pre-tool-use');
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js')); } catch { continue; }
    for (const f of files) {
      if (!rewritesInput(path.join(dir, f))) continue;
      rewriters++;
      findings.push({ msg: 'PreToolUse module rewrites tool input', file: path.join(dir, f) });
    }
  }
  for (const s of settingsOf(root, home)) {
    for (const entry of ((s.json.hooks || {}).PreToolUse || [])) {
      if (entry.matcher && !/Bash|\*/.test(entry.matcher)) continue;
      for (const h of entry.hooks || []) {
        if (!h.command) continue;
        rewriters++;
        findings.push({ msg: `own PreToolUse hook on Bash: ${String(h.command).slice(0, 80)}`, file: s.file });
      }
    }
  }
  if (!rewriters) findings.push({ msg: 'no PreToolUse hook filters noisy commands — full test and build output lands in context and is re-sent on every later call' });
  return check('tw-hooks', 'Output-filter hooks', rewriters ? 'green' : 'yellow', findings, { metrics: { rewriters } });
}

function subagents({ root, home }) {
  const dirs = [path.join(home, '.claude', 'agents'), path.join(root, '.claude', 'agents')];
  try { for (const p of fs.readdirSync(path.join(root, 'plugins'))) dirs.push(path.join(root, 'plugins', p, 'agents')); } catch { /* not the source repo */ }
  const rows = [];
  for (const d of dirs) {
    let files = [];
    try { files = fs.readdirSync(d).filter((f) => f.endsWith('.md')); } catch { continue; }
    for (const f of files) {
      const fm = /^---\n([\s\S]*?)\n---/.exec(String(readText(path.join(d, f)) || '').replace(/\r\n/g, '\n'));
      const m = fm && /^model:\s*(\S+)/m.exec(fm[1]);
      rows.push({ file: path.join(d, f), model: m ? m[1] : 'inherit' });
    }
  }
  const inherit = rows.filter((r) => r.model === 'inherit');
  const findings = inherit.map((r) => ({ msg: 'no model pin — runs on the session model (often opus)', file: r.file }));
  findings.unshift({ msg: `${rows.length} agent(s), ${inherit.length} without a model pin` });
  return check('tw-subagents', 'Subagent models', inherit.length ? 'yellow' : 'green', findings, { metrics: { agents: rows.length, inherit: inherit.length } });
}

/** Values one cron field takes (`*`, `*\/n`, `a-b`, `a-b/n`, lists). */
function cronField(f, lo, hi) {
  const out = new Set();
  for (const part of String(f).split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part.trim());
    if (!m) return null;
    const a = m[1] === '*' ? lo : Number(m[2]);
    const b = m[1] === '*' ? hi : m[3] !== undefined ? Number(m[3]) : m[4] ? hi : a;
    const step = Number(m[4] || 1);
    if (step < 1) return null; // `*/0` would never advance
    for (let v = a; v <= b; v += step) out.add(v);
  }
  return out.size;
}

/** Approximate runs per day of a 5-field cron (minute × hour; day fields ignored), or null. */
function cronRunsPerDay(expr) {
  const f = String(expr || '').trim().split(/\s+/);
  if (f.length !== 5) return null;
  const m = cronField(f[0], 0, 59); const h = cronField(f[1], 0, 23);
  return m && h ? m * h : null;
}

function cacheTtl(root, home) {
  let ttl = '5m';
  for (const s of settingsOf(root, home)) if (s.json.promptCacheTtl) ttl = String(s.json.promptCacheTtl);
  return ttl;
}

function scheduled({ root, home }) {
  const dir = path.join(home, '.claude', 'scheduled-tasks');
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { /* none */ }
  const ttl = cacheTtl(root, home);
  const findings = [];
  // Twin tasks share one body that names every cron: count each expression once.
  const seen = new Set();
  let perDay = 0;
  for (const n of names) {
    const file = path.join(dir, n, 'SKILL.md');
    const crons = [...String(readText(file) || '').matchAll(/cron\s+`([^`]+)`/g)].map((m) => m[1].trim());
    const fresh = crons.filter((c) => !seen.has(c) && cronRunsPerDay(c) != null);
    fresh.forEach((c) => seen.add(c));
    const sum = fresh.reduce((a, c) => a + cronRunsPerDay(c), 0);
    perDay += sum;
    const msg = fresh.length ? `~${sum} run(s)/day (${fresh.join(' + ')})` : crons.length ? 'cron already counted for a twin task' : 'interval set in the app (not in the file)';
    findings.push({ msg, file });
  }
  findings.unshift({ msg: `${names.length} scheduled model task(s), ~${perDay} run(s)/day known; cache TTL ${ttl} — every run that starts more than ${ttl} after the last one pays the full prompt again` });
  const status = perDay > SCHEDULED_RUNS_YELLOW ? 'yellow' : 'green';
  return check('tw-scheduled', 'Scheduled work vs cache TTL', status, findings, { metrics: { tasks: names.length, runsPerDay: perDay, ttl } });
}

/** Newest session transcript under projectsDir. */
function newestSession(projectsDir) {
  let best = null;
  let dirs = [];
  try { dirs = fs.readdirSync(projectsDir, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { return null; }
  for (const d of dirs) {
    let files = [];
    try { files = fs.readdirSync(path.join(projectsDir, d.name)).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const p = path.join(projectsDir, d.name, f);
      let st; try { st = fs.statSync(p); } catch { continue; }
      if (!best || st.mtimeMs > best.mtimeMs) best = { file: p, mtimeMs: st.mtimeMs, size: st.size };
    }
  }
  if (!best) return null;
  // Same cap as the transcript mining: a larger file is not read into memory.
  if (best.size > MAX_FILE_BYTES) return { file: best.file, text: '', tooBig: best.size };
  return { file: best.file, text: readText(best.file) || '' };
}

/** Usage split of one transcript: main-thread calls, once per message id. */
function cacheSplit(text) {
  const seen = new Set();
  const sum = { calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  let first = null; let last = null;
  for (const line of String(text || '').split('\n')) {
    if (!line.includes('"assistant"') || !line.includes('"usage"')) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.type !== 'assistant' || o.isSidechain) continue;
    const id = o.message && o.message.id;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    const u = (o.message && o.message.usage) || {};
    const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    if (first == null) first = ctx;
    last = ctx;
    sum.calls++;
    sum.input += u.input_tokens || 0;
    sum.cacheRead += u.cache_read_input_tokens || 0;
    sum.cacheWrite += u.cache_creation_input_tokens || 0;
    sum.output += u.output_tokens || 0;
  }
  const total = sum.input + sum.cacheRead + sum.cacheWrite + sum.output;
  const pct = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  return {
    ...sum, total, firstContext: first, lastContext: last,
    pct: { input: pct(sum.input), cacheRead: pct(sum.cacheRead), cacheWrite: pct(sum.cacheWrite), output: pct(sum.output) },
  };
}

function cache({ newest }) {
  const title = 'Cache split (newest session)';
  if (!newest) return check('tw-cache', title, 'skipped', [{ msg: 'no session log found' }]);
  if (newest.tooBig) return check('tw-cache', title, 'skipped', [{ msg: `newest session larger than ${Math.round(MAX_FILE_BYTES / 1048576)} MB, not read`, file: newest.file }]);
  const s = cacheSplit(newest.text);
  if (!s.calls) return check('tw-cache', title, 'skipped', [{ msg: 'newest session has no assistant usage', file: newest.file }]);
  const status = s.pct.cacheWrite > 30 ? 'red' : s.pct.cacheRead < 70 ? 'yellow' : 'green';
  return check('tw-cache', title, status, [
    { msg: `${s.calls} calls · cache read ${s.pct.cacheRead}% · cache write ${s.pct.cacheWrite}% · input ${s.pct.input}% · output ${s.pct.output}%`, file: newest.file },
    { msg: `context ~${s.firstContext} tok on the first call, ~${s.lastContext} on the last` },
  ], { metrics: s });
}

/** Summary of the alpha token log (#1002): hooks by chars, tools by result size, turn usage. */
function summarizeTokenLog(text, { top = 8 } = {}) {
  const hooksBy = {}; const toolsBy = {}; const events = {};
  const usage = { turns: 0, calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  let lines = 0; let firstTs = null; let lastTs = null;
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (!r || typeof r !== 'object') continue;
    lines++;
    if (typeof r.ts === 'string') { firstTs = firstTs || r.ts; lastTs = r.ts; }
    events[r.event] = (events[r.event] || 0) + (r.ctx || 0);
    for (const [h, n] of Object.entries(r.hooks || {})) {
      const k = `${r.event}:${h}`;
      hooksBy[k] = hooksBy[k] || { chars: 0, runs: 0 };
      hooksBy[k].chars += Number(n) || 0;
      hooksBy[k].runs++;
    }
    if (r.tool && r.result) {
      toolsBy[r.tool] = toolsBy[r.tool] || { chars: 0, calls: 0 };
      toolsBy[r.tool].chars += Number(r.result) || 0;
      toolsBy[r.tool].calls++;
    }
    if (r.usage) {
      usage.turns++;
      for (const k of ['calls', 'input', 'cacheRead', 'cacheWrite', 'output']) usage[k] += Number(r.usage[k]) || 0;
    }
  }
  const rank = (o) => Object.entries(o).sort((a, b) => b[1].chars - a[1].chars).slice(0, top)
    .map(([name, v]) => ({ name, ...v, tokens: tokensOfChars(v.chars) }));
  return { lines, firstTs, lastTs, events, hooks: rank(hooksBy), tools: rank(toolsBy), usage };
}

function tokenLog({ logFile }) {
  const title = 'Token log (alpha)';
  const text = logFile ? readText(logFile) : null;
  if (text == null) return check('tw-token-log', title, 'skipped', [{ msg: 'no token log (the token-log feature is alpha only)' }]);
  const s = summarizeTokenLog(text);
  const findings = [
    { msg: `${s.lines} records ${s.firstTs ? s.firstTs.slice(0, 10) : '?'} … ${s.lastTs ? s.lastTs.slice(0, 10) : '?'}`, file: logFile },
    ...s.hooks.map((h) => ({ msg: `hook ${h.name}: ~${h.tokens} tok over ${h.runs} runs` })),
    ...s.tools.slice(0, 5).map((t) => ({ msg: `tool ${t.name}: ~${t.tokens} tok of results over ${t.calls} calls` })),
  ];
  if (s.usage.turns) findings.push({ msg: `${s.usage.turns} turns, ${s.usage.calls} API calls, output ${s.usage.output} tok, cache write ${s.usage.cacheWrite} tok` });
  return check('tw-token-log', title, 'green', findings, { metrics: { ...s, file: logFile } });
}

/**
 * Drop every token-log line stamped at or before `untilTs` — the lines the
 * audit summarised. Newer lines (written while the audit ran) stay; a line
 * without a readable timestamp is dropped. Never throws.
 * @returns {{kept:number, dropped:number}|null}
 */
function pruneTokenLog(logFile, untilTs) {
  if (!logFile || !untilTs) return null;
  try {
    const raw = fs.readFileSync(logFile);
    const text = raw.toString('utf8');
    const keep = []; let dropped = 0;
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let ts = null;
      try { ts = JSON.parse(line).ts; } catch { /* broken line: dropped */ }
      if (typeof ts === 'string' && ts > untilTs) keep.push(line); else dropped++;
    }
    // A hook may append while this runs: carry over what arrived since the read.
    let since = '';
    try { since = fs.readFileSync(logFile).subarray(raw.length).toString('utf8'); } catch { /* gone: nothing to carry */ }
    fs.writeFileSync(logFile, (keep.length ? `${keep.join('\n')}\n` : '') + since);
    return { kept: keep.length, dropped };
  } catch { return null; }
}

/**
 * Run every token-waste check.
 * @param {{root?:string, home?:string, env?:object, projectsDir?:string, logFile?:string|null}} opts
 */
async function runTokenWaste({ root = process.cwd(), home = os.homedir(), env = process.env, projectsDir, logFile } = {}) {
  const newest = newestSession(projectsDir || path.join(home, '.claude', 'projects'));
  const ctx = { root, home, env, newest, logFile: logFile === undefined ? tokenLogPath(env, home) : logFile };
  const defs = [
    ['tw-memory', 'Memory files (CLAUDE.md)', memory],
    ['tw-tools', 'MCP tools and deferral', tools],
    ['tw-model', 'Model and effort', model],
    ['tw-hooks', 'Output-filter hooks', hooks],
    ['tw-subagents', 'Subagent models', subagents],
    ['tw-scheduled', 'Scheduled work vs cache TTL', scheduled],
    ['tw-cache', 'Cache split (newest session)', cache],
    ['tw-token-log', 'Token log (alpha)', tokenLog],
  ];
  const out = [];
  for (const [id, title, fn] of defs) out.push(await timed(id, title, () => fn(ctx)));
  return out;
}

module.exports = { runTokenWaste, memoryFiles, cacheSplit, modelsOf, cronRunsPerDay, summarizeTokenLog, pruneTokenLog, tokenLogPath, rewritesInput };
