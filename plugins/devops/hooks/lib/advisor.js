/**
 * @module advisor
 * @version 0.1.0
 * @description The Claude Code Advisor (experimental, `advisorModel` setting):
 *   a stronger model advises the session at decision points, and every
 *   subagent inherits it — a wave of N agents consults it N more times.
 *   A Fable advisor draws the capped Fable share (Max/Ultra/premium seats)
 *   or bills usage credits (Pro/standard Team). The plugin only names it
 *   once at SessionStart; it never gates on it (the feature is experimental
 *   and a runtime /advisor toggle may never reach a settings file).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** The configured advisor model, or null. Precedence: local > project > user settings. */
function advisorModel({ cwd = process.cwd(), home = os.homedir() } = {}) {
  const files = [
    path.join(cwd, '.claude', 'settings.local.json'),
    path.join(cwd, '.claude', 'settings.json'),
    path.join(home, '.claude', 'settings.json'),
  ];
  for (const f of files) {
    const s = readJson(f);
    const m = s && typeof s.advisorModel === 'string' ? s.advisorModel.trim() : '';
    if (m) return m;
  }
  return null;
}

/** One SessionStart line when an advisor is configured, else ''. `tier` from plan.js. */
function advisorLine(model, tier) {
  if (!model) return '';
  const fable = /fable/i.test(model);
  const cost = !fable
    ? 'its tokens count toward the plan'
    : (tier === 'pro' || tier === 'free')
      ? 'a Fable advisor bills usage credits here'
      : tier === 'team'
        ? 'a Fable advisor draws the Fable share on premium seats, else bills usage credits'
        : 'a Fable advisor draws the capped Fable share';
  return `[advisor] ${model} advises this session — every spawned agent inherits it (N agents = N× advisor calls; ${cost}). Prefer fewer, larger agent waves.`;
}

module.exports = { advisorModel, advisorLine };
