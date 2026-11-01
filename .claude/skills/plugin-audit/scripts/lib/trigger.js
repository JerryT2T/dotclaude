#!/usr/bin/env node
'use strict';
/**
 * @script plugin-audit/trigger
 * @version 0.2.0
 * @description Decides whether a ship starts a plugin audit: when the
 *   shipped version crosses a decade boundary (floor(minor/10) grows, e.g.
 *   0.289.3 -> 0.290.0) AND no audit is recorded for that decade yet, or
 *   when the last recorded audit is MONTHLY_DAYS or more old (#1000 — the
 *   token log and the token-waste checks want a monthly read). Intermediate
 *   ships and promotions (no version change) never run.
 *
 *   Usage: node trigger.js --prev 0.289.3 --new 0.290.0 [--state-dir DIR]
 *   Prints {"run":bool,"reason":"..."} and exits 0.
 */

const { stateDir, readLast } = require('./state');

const MONTHLY_DAYS = 30;
const DAY_MS = 24 * 3600 * 1000;

function parse(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || ''));
  return m ? { major: Number(m[1]), minor: Number(m[2]), decade: Math.floor(Number(m[2]) / 10) } : null;
}

/**
 * @param {{prevVersion:string, newVersion:string, last?:object|null, now?:number}} p
 * @returns {{run:boolean, reason:string}}
 */
function shouldRun({ prevVersion, newVersion, last, now = Date.now() } = {}) {
  const p = parse(prevVersion); const n = parse(newVersion);
  if (!p || !n) return { run: false, reason: 'unparseable version' };
  const crossed = n.major > p.major || (n.major === p.major && n.decade > p.decade);
  if (!crossed) {
    const grew = String(newVersion).replace(/^v/, '') !== String(prevVersion).replace(/^v/, '');
    const age = last && last.ranAt ? (now - Date.parse(last.ranAt)) / DAY_MS : NaN;
    if (grew && age >= MONTHLY_DAYS) return { run: true, reason: `last audit ${Math.floor(age)} days ago (${last.version}), monthly run due` };
    return { run: false, reason: `no decade boundary (${p.major}.${p.decade}x -> ${n.major}.${n.decade}x)${Number.isFinite(age) ? `, last audit ${Math.floor(age)} days ago` : ''}` };
  }
  const lastMajor = last ? (parse(last.version) || {}).major : null;
  if (last && last.decade === n.decade && lastMajor === n.major) {
    return { run: false, reason: `audit already recorded for decade ${n.major}.${n.decade}x (${last.version})` };
  }
  return { run: true, reason: last ? `decade boundary crossed, last audit ${last.version}` : 'decade boundary crossed, first audit ever' };
}

function main(argv) {
  const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const dir = stateDir(process.cwd(), get('--state-dir'));
  const res = shouldRun({ prevVersion: get('--prev'), newVersion: get('--new'), last: readLast(dir) });
  process.stdout.write(`${JSON.stringify(res)}\n`);
  return 0;
}

module.exports = { shouldRun, parse, MONTHLY_DAYS };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
