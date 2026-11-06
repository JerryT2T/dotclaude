/**
 * @module issue-guard-match
 * @version 0.3.1
 * @description Pure matcher for pre.issue.guard — decides whether a Bash or
 *   PowerShell command contains a REAL issue write that must instead go
 *   through the auto-issue skill (formerly setup-issue), the single
 *   owner of every issue write (deep-knowledge/plugin-behavior.md "Issue
 *   Creation & Editing — Always Delegate"). Two write shapes:
 *     - `gh issue create` / `gh issue edit`;
 *     - `gh api …/issues[/N][/labels|/assignees]` that writes: an explicit
 *       `-X`/`--method` POST|PATCH|PUT|DELETE, or — without an explicit
 *       method — any `-f`/`-F`/`--field`/`--raw-field`/`--input` (gh then
 *       sends a POST). `-X GET` with fields is a read.
 *
 *   Line continuations are joined first (`\` + newline in bash, a backtick +
 *   newline in PowerShell), so a multi-line write is one segment.
 *
 *   Two-stage match (as ship-guard-match, #198):
 *     1. maskQuoted() blanks quoted spans, heredocs and here-strings
 *        (offsets preserved), so `gh issue create` merely appearing inside
 *        prose (an issue body, a commit message, a grep pattern) does not
 *        count.
 *     2. The pattern is anchored to a command position — start of the
 *        command or right after a separator (`\n ; & | ( ) { }` and a
 *        backtick) — and tolerates what may sit between that position and
 *        the write: env assignments (`GH_REPO=x`), `env`, `command`, `exec`,
 *        `sudo`, `time`, `nohup`, a path to the binary (`/usr/bin/gh`,
 *        `gh.exe`), gh's global flags (`-R owner/repo`, `--repo=x`) before
 *        or after `issue` / `api`.
 *
 *   Marker: auto-issue appends `# via auto-issue` to every issue write it
 *   runs. The marker only counts on the SAME command segment as the gh call —
 *   the shell comment that ends that very command (before the next
 *   separator or newline). Every write in a command must carry its own
 *   marker. A marker inside quotes never counts. The marker alone is not
 *   enough: pre.issue.guard also requires auto-issue (or the old name setup-issue) to have
 *   been invoked in the current turn.
 */

const { maskQuoted, ghVerbRe, ghApiRe, joinContinuations, segmentBounds, isApiWrite } = require('./ship-guard-match');

const WRITE_RE = ghVerbRe('issue', ['create', 'edit']);

/** `gh api` at a command position: the rest of the segment decides. */
const API_RE = ghApiRe(['issue', 'create', 'edit', 'api']);

/** An issue (or its labels/assignees) endpoint — not comments, not timeline. */
const API_ISSUE_PATH_RE =
  /(?:^|\s)\/?repos\/[^\s/]+\/[^\s/]+\/issues(?:\/\d+(?:\/(?:labels|assignees)(?:\/[^\s/?]+)?)?)?(?:\?\S*)?(?=\s|$)/i;

/** The marker auto-issue appends to every issue write it performs. The
 *  pre-PR-2 skill wrote `# via setup-issue`; both stay valid so an old
 *  extension or a cached skill body still passes. */
const MARKER_RE = /#\s*via\s+(?:auto|setup)-issue\b/i;

/** Does the segment's own trailing comment carry the marker? */
function segmentMarked(cmd, masked, from) {
  const { hash } = segmentBounds(masked, from);
  if (hash === -1) return false;
  // A comment runs to the end of the line, past `;`/`|` inside it.
  const nl = masked.indexOf('\n', hash);
  const commentEnd = nl === -1 ? cmd.length : nl;
  return MARKER_RE.test(masked.slice(hash, commentEnd));
}

/** Is this `gh api` segment (quotes removed, comment cut) an issue write? */
function isApiIssueWrite(args) {
  return API_ISSUE_PATH_RE.test(args) && isApiWrite(args);
}

/**
 * Every real issue write in the command, with whether its own segment
 * carries the marker.
 * @param {string} cmd raw command
 * @returns {{index:number, verb:string, marked:boolean}[]}
 */
function findIssueWrites(cmd) {
  if (!cmd || typeof cmd !== 'string') return [];
  const joined = joinContinuations(cmd);
  const masked = maskQuoted(joined);
  const out = [];
  for (const m of masked.matchAll(WRITE_RE)) {
    out.push({ index: m.index, verb: m[1].toLowerCase(), marked: segmentMarked(joined, masked, m.index + m[0].length) });
  }
  for (const m of masked.matchAll(API_RE)) {
    const from = m.index + m[0].length;
    const { end, hash } = segmentBounds(masked, from);
    const args = joined.slice(from, hash === -1 ? end : hash).replace(/["']/g, '');
    if (!isApiIssueWrite(args)) continue;
    out.push({ index: m.index, verb: 'api', marked: segmentMarked(joined, masked, from) });
  }
  return out.sort((a, b) => a.index - b.index);
}

/**
 * @param {string} cmd raw command
 * @returns {boolean} true for a real issue write (quoted occurrences
 *   excluded), marked or not.
 */
function isRawIssueWriteCommand(cmd) {
  return findIssueWrites(cmd).length > 0;
}

/**
 * Does EVERY issue write in the command carry its own same-segment marker?
 * False when there is no write at all.
 * @param {string} cmd
 * @returns {boolean}
 */
function hasSetupIssueMarker(cmd) {
  const writes = findIssueWrites(cmd);
  return writes.length > 0 && writes.every(w => w.marked);
}

/**
 * A write without its own marker.
 * @param {string} cmd
 * @returns {boolean}
 */
function isUnmarkedIssueWrite(cmd) {
  return findIssueWrites(cmd).some(w => !w.marked);
}

/** GitHub MCP tools that create or edit an issue (`issue_write` in the
 *  current github-mcp-server, `create_issue` / `update_issue` in older ones),
 *  under any connector namespace (`mcp__plugin_github_github__issue_write`). */
const MCP_ISSUE_WRITE_RE = /^mcp__.*github.*__(?:issue_write|create_issue|update_issue)$/i;

function isMcpIssueWriteTool(name) {
  return typeof name === 'string' && MCP_ISSUE_WRITE_RE.test(name);
}

module.exports = {
  findIssueWrites,
  isRawIssueWriteCommand,
  hasSetupIssueMarker,
  isUnmarkedIssueWrite,
  isApiIssueWrite,
  isMcpIssueWriteTool,
  joinContinuations,
  MARKER_RE,
  MCP_ISSUE_WRITE_RE,
};
