'use strict';
/**
 * @module backlog/in-progress
 * @description Which backlog issues another session or a Claude Projects thread already
 *   works on, so a backlog run leaves them alone (GitHub stays the single backlog
 *   source). The marks are the ones prompt.issue.detect and the project threads set:
 *   the project board status "In Progress", an "in progress" label, or an assignee
 *   other than the run's own user. Pure: input is the JSON of
 *   `gh issue list --json number,title,labels,assignees,projectItems`.
 *
 *   CLI:  gh issue list … --json … | node in-progress.js [--me <login>]
 *         prints {"queue":[…],"skipped":[{number,title,why}]} — the same filter runs again
 *         right before each issue of the Step 4 loop (the mark may have appeared since).
 */

const IN_PROGRESS = /^in[ _-]?progress$/i;

/** Why `issue` counts as taken by someone else, or null. */
function inProgressReason(issue, me = null) {
  if (!issue || typeof issue !== 'object') return null;
  for (const item of issue.projectItems || []) {
    const status = item && (typeof item.status === 'string' ? item.status : item.status && item.status.name);
    if (status && IN_PROGRESS.test(String(status).trim())) return 'board status In Progress';
  }
  for (const l of issue.labels || []) {
    const name = typeof l === 'string' ? l : l && l.name;
    if (name && IN_PROGRESS.test(String(name).trim())) return 'label in progress';
  }
  const others = (issue.assignees || []).map((a) => (typeof a === 'string' ? a : a && a.login)).filter(Boolean)
    .filter((login) => !me || login.toLowerCase() !== String(me).toLowerCase());
  if (others.length) return `assigned to ${others.join(', ')}`;
  return null;
}

/**
 * @param {object[]} issues
 * @param {{me?: string|null}} [opts] the run's own GitHub login: its own assignment is no mark
 * @returns {{queue: object[], skipped: {number: number, title: string, why: string}[]}}
 */
function filterInProgress(issues, { me = null } = {}) {
  const queue = [];
  const skipped = [];
  for (const issue of Array.isArray(issues) ? issues : []) {
    const why = inProgressReason(issue, me);
    if (why) skipped.push({ number: issue.number, title: issue.title || '', why });
    else queue.push(issue);
  }
  return { queue, skipped };
}

module.exports = { inProgressReason, filterInProgress };

if (require.main === module) {
  const i = process.argv.indexOf('--me');
  const me = i > 0 ? process.argv[i + 1] : null;
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    let issues = [];
    try { issues = JSON.parse(raw); } catch { /* empty input: nothing to filter */ }
    process.stdout.write(`${JSON.stringify(filterInProgress(issues, { me }))}\n`);
  });
}
