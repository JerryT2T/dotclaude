/**
 * @module plan-defaults
 * @version 0.2.0
 * @plugin devops
 * @description Shared plan-specific token defaults used by ss.tokens.scan
 *   and pre.tokens.guard hooks. Values come from plan.js; keys are the plan
 *   ids plus the legacy config keys (max_5, max_20), which stay valid.
 */
const { PLANS, TOKEN_KEYS } = require('./plan');

// Context window is ~200K for all Claude models (plan-independent).
// Threshold percentage scales with plan: higher plans = more budget = more
// generous per-operation allowance.
const entry = (id) => ({ estimatedLimitTokens: 200000, confirmThresholdPct: PLANS[id].tokenPct });

const PLAN_DEFAULTS = {};
for (const id of Object.keys(PLANS)) PLAN_DEFAULTS[id] = entry(id);
for (const [legacy, id] of Object.entries(TOKEN_KEYS)) PLAN_DEFAULTS[legacy] = entry(id);

module.exports = PLAN_DEFAULTS;
