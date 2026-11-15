'use strict';
/**
 * @module scripts/lib/cleanup-rule
 * @version 0.1.0
 * @plugin devops
 * @description The one age/count rule for removable leftovers. ship_hygiene
 *   (planAutoClean), the auto-cleanup autonomous class (orphan-scan
 *   --clean-landed) and auto-agents' post-merge worktree handling
 *   (integration-check --remove) all ask it, so nothing is deleted behind its
 *   back: the newest `autoCleanKeepNewest` stay for inspection, nothing
 *   younger than `autoCleanMinAgeDays` goes, and the age trigger only fires
 *   once something is older than `autoCleanGateDays`.
 *   Also names what an isolated sub-agent leftover is (`isAgentLeftover`).
 */

/** `.claude/worktrees/agent-<hex>` — an Agent-tool `isolation: "worktree"` checkout. */
const AGENT_WORKTREE = /\/\.claude\/worktrees\/agent-[0-9a-f]+$/i;
/** `worktree-agent-<hex>` (the branch the Agent tool creates) or an `agent-<hex>` sub-branch. */
const AGENT_BRANCH = /(^|\/)(?:worktree-)?agent-[0-9a-f]{6,}$/i;

/** @param {string} p */
function isAgentWorktreePath(p) {
  return AGENT_WORKTREE.test(String(p || '').replace(/[\\]/g, '/').replace(/\/+$/, ''));
}

/**
 * An isolated sub-agent leftover: an agent worktree, or a branch named like
 * the ones the Agent tool creates. A worktree is judged by its path only (the
 * branch it holds is arbitrary: `kw/stage-codex`).
 * @param {{kind?:string, path?:string, branch?:string|null, agent?:boolean}} u
 */
function isAgentLeftover(u) {
  if (!u) return false;
  if (u.kind === 'worktree') return Boolean(u.agent) || isAgentWorktreePath(u.path);
  return u.kind === 'branch' && AGENT_BRANCH.test(u.branch || '');
}

/**
 * Which of the removable leftovers the age and count triggers pick.
 * @param {{key:string, ageDays:number}[]} removable
 * @param {{autoCleanGateDays:number, autoCleanMinAgeDays:number, autoCleanKeepNewest?:number}} rule
 * @param {Set<string>} [skip] keys already picked by an earlier trigger
 * @returns {{picks:{unit:object, trigger:'age'|'count'}[], newestFirst:object[]}}
 */
function pickByAgeCount(removable, rule, skip = new Set()) {
  const keepNewest = rule.autoCleanKeepNewest ?? 0;
  const newestFirst = removable.filter((u) => !skip.has(u.key)).sort((a, b) => a.ageDays - b.ageDays);
  const picks = [];
  const seen = new Set();
  const add = (unit, trigger) => { if (!seen.has(unit.key) && !skip.has(unit.key)) { seen.add(unit.key); picks.push({ unit, trigger }); } };
  if (removable.some((u) => u.ageDays > rule.autoCleanGateDays)) {
    for (const u of removable) if (u.ageDays > rule.autoCleanMinAgeDays) add(u, 'age');
  }
  if (keepNewest > 0) for (const u of newestFirst.slice(keepNewest)) add(u, 'count');
  return { picks, newestFirst };
}

module.exports = { isAgentLeftover, isAgentWorktreePath, pickByAgeCount, AGENT_WORKTREE, AGENT_BRANCH };
