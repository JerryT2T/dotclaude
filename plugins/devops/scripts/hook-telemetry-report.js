#!/usr/bin/env node
/**
 * Hook cost report over the last N days: the daily rollup of
 * hooks/lib/hook-telemetry.js plus the not-yet-folded raw records.
 *
 * Usage: node scripts/hook-telemetry-report.js [--days 30] [--json] [--file <raw.jsonl>]
 * Per hook: runs, blocks, output tokens (~chars/4), p50/p95 ms (histogram
 * bucket upper bound), sorted by output tokens. `--json` prints an array.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const tel = require('../hooks/lib/hook-telemetry');

function pendingText(file) {
  const dir = path.dirname(file);
  const base = path.basename(file);
  const names = [base];
  try { names.push(...fs.readdirSync(dir).filter((n) => n.startsWith(`${base}.fold-`))); } catch { /* no dir */ }
  let text = '';
  for (const n of names) { try { text += `${fs.readFileSync(path.join(dir, n), 'utf8')}\n`; } catch { /* missing */ } }
  return text;
}

/** @returns {Array<{hook,runs,blocks,errors,timeouts,chars,tokens,p50,p95}>} sorted by tokens desc */
function buildReport(file, { days = 30, now = Date.now() } = {}) {
  const roll = tel.loadRollup(file);
  tel.mergeDays(roll.days, tel.aggregateText(pendingText(file), {}));
  const from = new Date(now - days * 86400000).toISOString().slice(0, 10);
  const byHook = new Map();
  for (const [day, keys] of Object.entries(roll.days)) {
    if (day < from) continue;
    for (const [key, e] of Object.entries(keys)) {
      const hook = key.split('|')[0];
      const t = byHook.get(hook) || { hook, runs: 0, blocks: 0, errors: 0, timeouts: 0, chars: 0, ms: new Array(tel.BUCKETS.length + 1).fill(0) };
      t.runs += e.runs;
      t.blocks += e.out.block || 0;
      t.errors += e.out.error || 0;
      t.timeouts += (e.out.timeout || 0) + (e.out.skipped || 0);
      t.chars += e.chars;
      e.ms.forEach((n, i) => { t.ms[i] += n; });
      byHook.set(hook, t);
    }
  }
  return [...byHook.values()].map(({ ms, ...t }) => ({
    ...t, tokens: Math.round(t.chars / 4), p50: tel.percentile(ms, 0.5), p95: tel.percentile(ms, 0.95),
  })).sort((a, b) => b.tokens - a.tokens || b.runs - a.runs);
}

function renderTable(rows, days) {
  const head = ['hook', 'runs', 'blocks', 'err', 'kill', 'out-tok', 'p50ms', 'p95ms'];
  const body = rows.map((r) => [r.hook, r.runs, r.blocks, r.errors, r.timeouts, r.tokens, r.p50 ?? '-', r.p95 ?? '-'].map(String));
  const w = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells) => cells.map((c, i) => (i ? c.padStart(w[i]) : c.padEnd(w[i]))).join('  ');
  return [`Hook telemetry, last ${days} days`, line(head), ...body.map(line)].join('\n');
}

function main(argv) {
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const days = Number(arg('--days')) > 0 ? Number(arg('--days')) : 30;
  const file = arg('--file') || tel.filePath() || path.join(require('os').homedir(), '.claude', 'devops-hook-telemetry.jsonl');
  const rows = buildReport(file, { days });
  process.stdout.write(`${argv.includes('--json') ? JSON.stringify(rows, null, 2) : renderTable(rows, days)}\n`);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { buildReport, renderTable };
