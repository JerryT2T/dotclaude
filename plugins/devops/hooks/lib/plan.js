'use strict';
/**
 * @module plan
 * @version 0.1.0
 * @plugin devops
 * @description Single source of truth for Claude plans: ids, labels, aliases,
 *   class thresholds, relative capacity, window fill time, defer threshold,
 *   5-hour and Fable semantics. No dependencies. Every consumer imports this;
 *   `deep-knowledge/plans.md` mirrors it and a test keeps both equal.
 *   Official facts checked 2026-11-06: claude.com/pricing and
 *   support.claude.com/en/articles/17728952 (Ultra), /11049741 (Max).
 */

const SOURCE = {
  checked: '2026-11-06',
  urls: [
    'https://claude.com/pricing',
    'https://support.claude.com/en/articles/17728952',
    'https://support.claude.com/en/articles/11049741',
  ],
};

/**
 * Per plan:
 * - capacity: usage relative to Pro (null = not published)
 * - fillMin: minutes a ceremony needs to drain a 5 h window (drives refresh age)
 * - askAt / sonnetAt: [fiveHourPct, weeklyPct] where the class flips
 * - deferAt: 5 h fill at which the defer-to-reset question pays off
 * - tokenPct: confirm threshold of the token guard (share of the context window)
 * - fiveHour: 'yes' | 'unverified-only' (Ultra: none once verified) | 'unstated'
 * - fable: how Fable usage is limited
 */
const PLANS = {
  free:  { label: 'Free',  capacity: null, fillMin: 30,  askAt: [0, 0],   sonnetAt: [70, 85], deferAt: 70, tokenPct: 0.05, fiveHour: 'yes',             fable: 'none' },
  pro:   { label: 'Pro',   capacity: 1,    fillMin: 30,  askAt: [0, 0],   sonnetAt: [70, 85], deferAt: 70, tokenPct: 0.05, fiveHour: 'yes',             fable: 'credits' },
  max:   { label: 'Max',   capacity: 5,    fillMin: 150, askAt: [80, 90], sonnetAt: [95, 98], deferAt: 80, tokenPct: 0.08, fiveHour: 'yes',             fable: 'half-weekly' },
  ultra: { label: 'Ultra', capacity: 10,   fillMin: 300, askAt: [90, 95], sonnetAt: [98, 99], deferAt: 90, tokenPct: 0.10, fiveHour: 'unverified-only', fable: 'separate-weekly' },
  team:  { label: 'Team',  capacity: null, fillMin: 150, askAt: [80, 90], sonnetAt: [95, 98], deferAt: 80, tokenPct: 0.08, fiveHour: 'unstated',        fable: 'half-weekly-premium' },
};

const PLAN_IDS = Object.keys(PLANS);

/** The Fable facts: Fable is a model, limits come from the data (`limits[]`), never from the plan name. */
const FABLE = { sharePct: 50, scopeName: 'Fable' };

/**
 * Any stored or delivered plan string → plan id, or 'unknown'.
 * Accepts: default_claude_max_20x, default_claude_max_5x, default_claude_pro,
 * Max 20x, Max 5x, max_20, max_5, max20, max5, Ultra, Max, Pro, Free, Team,
 * Enterprise. "Max Plan" (the status line's placeholder) stays unknown.
 */
function planId(raw) {
  if (typeof raw !== 'string') return 'unknown';
  const s = raw.trim();
  if (PLANS[s.toLowerCase()]) return s.toLowerCase();
  if (/ultra/i.test(s)) return 'ultra';
  const m = s.match(/max[\s_]*(\d+)x?/i);
  if (m) return Number(m[1]) >= 20 ? 'ultra' : 'max';
  if (/^(?:default_)?(?:claude_)?max$/i.test(s)) return 'max';
  if (/(?:^|[^a-z])(?:team|enterprise)(?:$|[^a-z])/i.test(s)) return 'team';
  if (/(?:^|[^a-z])pro(?:$|[^a-z])/i.test(s)) return 'pro'; // "_" is a word char, so \bpro\b misses default_claude_pro
  if (/free/i.test(s)) return 'free';
  return 'unknown';
}

/** Display label for an id (null for unknown). */
function planLabel(id) {
  return PLANS[id] ? PLANS[id].label : null;
}

/**
 * What a `five_hour` value from the usage API means on a plan.
 * 'delivered' - a value came: always use it, for every plan.
 * 'none'      - null on Ultra: no 5 h limit applies.
 * 'idle'      - null elsewhere (or unknown plan): the window is idle.
 */
function fiveHourState(id, delivered) {
  if (delivered != null) return 'delivered';
  return id === 'ultra' ? 'none' : 'idle';
}

/**
 * Keys of the stored burn calibration (`burn` file). They predate the renames and
 * must not change, or existing calibration samples would be orphaned.
 */
const CALIBRATION_KEYS = { free: 'Free', pro: 'Pro', max: 'Max 5x', ultra: 'Max 20x', team: 'Team' };

/** Legacy keys of the token config (`"plan":"max_20"`), read through aliases. */
const TOKEN_KEYS = { pro: 'pro', max_5: 'max', max_20: 'ultra' };

module.exports = { SOURCE, PLANS, PLAN_IDS, FABLE, TOKEN_KEYS, CALIBRATION_KEYS, planId, planLabel, fiveHourState };
