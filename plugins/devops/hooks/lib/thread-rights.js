/**
 * @module thread-rights
 * @version 0.1.0
 * @description Which shell commands a COLLEAGUE turn may not run (Claude
 *   Projects, d-trust "alpha", line A4): a coordinator note or another
 *   thread's message may order work and an alpha ship, never a force-push, a
 *   branch / release / repository delete, or a recursive delete outside the
 *   scratch and temp folders — those need a message of the person in the
 *   thread itself (lib/project-thread.js `speaksForPerson`).
 *
 *   `destructiveReason(command, cwd)` is the pure half: the reason a command
 *   is destructive, or null. pre.thread.rights applies it for a colleague
 *   origin only. The check is syntactic and conservative: a path it cannot
 *   resolve (a variable, `~`) outside the temp folders counts as outside.
 *   Out of scope by design: `git reset --hard`, `git clean`, a plain push.
 *
 *   Also a promote to beta / stable: a push of a channel tag (`beta/vX.Y.Z`,
 *   `stable/vX.Y.Z`, bare `vX.Y.Z` = stable alias, as in mcp-server/ship/lib/channels.js),
 *   a tag created and pushed in one command, `gh release create`. An alpha ship
 *   (plain branch push, PR, merge, alpha tag) passes. The MCP tool ship_promote is
 *   denied by pre.thread.rights itself (`isPromoteTool`).
 *
 *   Wrapped commands are scanned too: parentheses, `env` / `sudo` / `command` /
 *   `xargs` / `nohup` prefixes, a path or backslash before the name (`/bin/rm`,
 *   `\rm`), and the quoted inner command of `bash -c`, `sh -c`, `cmd /c`,
 *   `pwsh -c`, `powershell -Command`.
 */

const os = require('os');
const path = require('path');

/** Split a command line into segments at `;`, `&&`, `||`, `|`, `&`, parentheses and newlines (outside quotes). */
function segments(command) {
  const out = [];
  let cur = '';
  let quote = '';
  const s = String(command || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === quote) quote = '';
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === ';' || ch === '\n' || ch === '|' || ch === '&' || ch === '(' || ch === ')') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Whitespace tokens with their quotes removed. */
function tokens(segment) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(segment))) out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  return out;
}

const norm = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase();

/** The scratch and temp roots a recursive delete may touch, lower-cased with forward slashes. */
function safeRoots() {
  const roots = new Set(['/tmp', '/var/tmp']);
  for (const v of [os.tmpdir(), process.env.TMPDIR, process.env.TEMP, process.env.TMP]) {
    if (v) roots.add(norm(v));
  }
  return [...roots];
}

/** True when `target` lies inside a scratch / temp folder (the session scratchpad lives under the temp root). */
function insideSafe(target, cwd) {
  if (!target || /[$%`]|^~/.test(target) || /(^|[\\/])\.\.([\\/]|$)/.test(target)) return false;
  if (/^\/(?:var\/)?tmp\/[^/]/.test(target)) return true; // a POSIX shell on Windows: /tmp is the temp folder
  const abs = norm(path.isAbsolute(target) || /^[a-z]:[\\/]/i.test(target) ? target : path.join(cwd || process.cwd(), target));
  return safeRoots().some((r) => abs.length > r.length && abs.startsWith(r + '/'));
}

/** Whole-token match of a channel tag the ship pipeline promotes to (beta, stable, bare = stable alias). */
const CHANNEL_TAG = /^(?:refs\/tags\/)?(?:beta\/|stable\/)?v\d+\.\d+\.\d+$/;
const PROMOTE_TAG = /^\+?(?:[^:\s]*:)?(?:refs\/tags\/)?(?:beta|stable)\/v\d+\.\d+\.\d+$|^\+?(?:[^:\s]*:)?refs\/tags\/v\d+\.\d+\.\d+$|^\+?v\d+\.\d+\.\d+$/;
const PROMOTE_REASON = 'a promote to beta/stable (channel tag push)';

const isShortFlags = (a, letters) => /^-[a-zA-Z]+$/.test(a) && [...a.slice(1)].every((c) => letters.includes(c));

function pushReason(t) {
  const args = t.slice(2);
  for (const a of args) {
    if (a === '--mirror') return PROMOTE_REASON; // pushes every ref, channel tags included
    if (a === '--tags' || a === '--follow-tags') return PROMOTE_REASON; // a tag made in an earlier call goes out with it
    if (a === '--prune') return 'a mirror / prune push';
    if (a === '--force' || a === '-f' || a.startsWith('--force-with-lease') || a === '--force-if-includes') return 'a force-push';
    if (/^-[a-zA-Z]+$/.test(a) && a.includes('f')) return 'a force-push';
    if (a === '--delete' || a === '-d') return 'a remote branch delete';
    if (a.startsWith('+') && a.length > 1) return 'a force-push (+refspec)';
    if (a.startsWith(':') && a.length > 1) return 'a remote branch delete (:ref)';
  }
  // positional args after the remote: a channel tag is a promote
  const positional = args.filter((a) => !/^-/.test(a)).slice(1);
  if (positional.some((a) => PROMOTE_TAG.test(a))) return PROMOTE_REASON;
  // a glob refspec under refs/tags/ matches the channel tags too
  if (positional.some((a) => /^\+?(?:[^:\s]*:)?refs\/tags\/.*[*?[]/.test(a))) return PROMOTE_REASON;
  return null;
}

const PS_RECURSE = /^-r(e(c(u(r(s(e|ive)?)?)?)?)?)?$/i;

function rmReason(t, cwd) {
  const flags = t.slice(1).filter((a) => /^-/.test(a));
  // POSIX flags (-r -R -rf --recursive); a PowerShell alias call (-Recurse, -Force) is read as PowerShell
  const recursive = flags.some((a) => a === '--recursive' || PS_RECURSE.test(a) || (isShortFlags(a, 'rRfivdIPxz') && /[rR]/.test(a)));
  if (!recursive) return null;
  const targets = t.slice(1).filter((a) => !/^-/.test(a));
  if (!targets.length) return 'a recursive delete without a target (piped or via xargs)';
  return targets.every((p) => insideSafe(p, cwd)) ? null : 'a recursive delete outside the scratch and temp folders';
}

function removeItemReason(t, cwd) {
  const recursive = t.slice(1).some((a) => PS_RECURSE.test(a));
  if (!recursive) return null;
  const targets = [];
  for (let i = 1; i < t.length; i++) {
    const a = t[i];
    if (/^-(path|literalpath)$/i.test(a) && t[i + 1]) { targets.push(t[++i]); continue; }
    if (/^-/.test(a)) { if (/^-(filter|include|exclude|credential|stream)$/i.test(a)) i++; continue; }
    targets.push(a);
  }
  if (!targets.length) return 'a recursive delete without a target (piped)';
  return targets.every((p) => insideSafe(p, cwd)) ? null : 'a recursive delete outside the scratch and temp folders';
}

/** cmd's `rd /s`, `rmdir /s`, `del /s` (and the PowerShell alias with -Recurse). */
function cmdDeleteReason(t, cwd) {
  if (t.slice(1).some((a) => PS_RECURSE.test(a))) return removeItemReason(t, cwd);
  if (!t.slice(1).some((a) => /^\/s$/i.test(a))) return null;
  const targets = t.slice(1).filter((a) => !/^\/[a-z]$/i.test(a));
  if (!targets.length) return 'a recursive delete without a target';
  return targets.every((p) => insideSafe(p, cwd)) ? null : 'a recursive delete outside the scratch and temp folders';
}

/** `find … -delete` / `-exec rm …` outside the temp folders. */
function findReason(t, cwd) {
  const deletes = t.some((a, i) => a === '-delete' || ((a === '-exec' || a === '-execdir' || a === '-ok') && /^(?:.*[\\/])?(?:rm|rmdir|unlink)(?:\.exe)?$/i.test(t[i + 1] || '')));
  if (!deletes) return null;
  const roots = [];
  for (let i = 1; i < t.length && !/^[-!(]/.test(t[i]); i++) roots.push(t[i]);
  if (!roots.length) roots.push('.');
  return roots.every((p) => insideSafe(p, cwd)) ? null : 'a find delete outside the scratch and temp folders';
}

const WRAPPERS = new Set(['sudo', 'command', 'env', 'xargs', 'nohup', 'time', 'exec', 'builtin', 'doas']);
const { SHELLS, MAX_DEPTH, headName, innerCommand } = require('./shell-inner');

/** Strip env assignments and wrapper commands (with their flags), return the token list for one segment. */
function commandTokens(segment) {
  const t = tokens(segment);
  for (;;) {
    if (!t.length) break;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0])) { t.shift(); continue; }
    const name = headName(t[0]);
    if (!WRAPPERS.has(name)) break;
    t.shift();
    while (t.length && /^-/.test(t[0])) {
      const f = t.shift();
      if ((name === 'sudo' || name === 'doas') && /^-[ugCT]$/.test(f)) t.shift();
      if (name === 'env' && /^-[uSC]$/.test(f)) t.shift();
    }
    while (name === 'env' && t.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0])) t.shift();
  }
  if (t.length) t[0] = headName(t[0]);
  // `git -C dir …` / `git -c k=v …`: drop the global options so the verb is t[1]
  if (t.length && headName(t[0]) === 'git') {
    let i = 1;
    let alias = false;
    while (i < t.length && /^-/.test(t[i])) {
      if (t[i] === '-c' && /^alias\./i.test(t[i + 1] || '')) alias = true;
      if (/^-calias\./i.test(t[i]) || /^--config-env=alias\./i.test(t[i])) alias = true;
      i += (t[i] === '-C' || t[i] === '-c' || t[i] === '--git-dir' || t[i] === '--work-tree') ? 2 : 1;
    }
    const out = ['git', ...t.slice(i)];
    if (alias) out.alias = true;
    return out;
  }
  return t;
}

function gitReason(t) {
  if (t.alias) return 'a git alias override (git -c alias.…)';
  if (t[1] === 'push') return pushReason(t);
  if (t[1] === 'branch') {
    const flags = t.slice(2).filter((a) => /^-/.test(a));
    if (flags.some((a) => a === '-D' || (/^-[a-zA-Z]+$/.test(a) && a.includes('D')))) return 'a branch delete (git branch -D)';
    const del = flags.some((a) => a === '--delete' || (/^-[a-zA-Z]+$/.test(a) && a.includes('d')));
    const force = flags.some((a) => a === '--force' || (/^-[a-zA-Z]+$/.test(a) && a.includes('f')));
    return del && force ? 'a forced branch delete (git branch -d -f)' : null;
  }
  if (t[1] === 'worktree' && t[2] === 'remove') return t.slice(3).some((a) => a === '--force' || a === '-f') ? 'a forced worktree removal' : null;
  return null;
}

function ghReason(t) {
  if (t[1] === 'repo' && t[2] === 'delete') return 'a repository delete';
  if (t[1] === 'release' && t[2] === 'delete') return 'a release delete';
  if (t[1] === 'release' && t[2] === 'create') return 'a release (gh release create)';
  if (t[1] === 'api') {
    const rest = t.slice(2);
    for (let i = 0; i < rest.length; i++) {
      if (/^(?:-X|--method)$/i.test(rest[i]) && /^DELETE$/i.test(rest[i + 1] || '')) return 'a GitHub API delete';
      if (/^(?:-X|--method=?)DELETE$/i.test(rest[i]) || /^--method=DELETE$/i.test(rest[i])) return 'a GitHub API delete';
    }
    if (rest.some((a) => /refs\/tags\/(?:beta|stable)\/v\d/.test(a))) return PROMOTE_REASON;
  }
  return null;
}

/**
 * The reason `command` is destructive (or promotes a release channel), or null.
 * @param {string} command
 * @param {string} [cwd] the session's working directory (relative delete targets)
 * @param {number} [depth] recursion into quoted inner commands
 * @returns {string|null}
 */
function destructiveReason(command, cwd, depth = 0) {
  let createsChannelTag = false;
  let pushes = false;
  for (const seg of segments(command)) {
    const t = commandTokens(seg);
    if (!t.length) continue;
    const head = headName(t[0]);
    let reason = null;
    if (head === 'git') {
      reason = gitReason(t);
      if (t[1] === 'push') pushes = true;
      if (t[1] === 'tag' && t.slice(2).some((a) => CHANNEL_TAG.test(a) && /(?:beta|stable)\//.test(a))) createsChannelTag = true;
    } else if (head === 'gh') {
      reason = ghReason(t);
    } else if (head === 'rm') {
      reason = rmReason(t, cwd);
    } else if (head === 'remove-item' || head === 'ri') {
      reason = removeItemReason(t, cwd);
    } else if (head === 'rd' || head === 'rmdir' || head === 'del' || head === 'erase') {
      reason = cmdDeleteReason(t, cwd);
    } else if (head === 'find') {
      reason = findReason(t, cwd);
    } else if (SHELLS.has(head) && depth < MAX_DEPTH) {
      const inner = innerCommand(t, head);
      if (inner) reason = destructiveReason(inner, cwd, depth + 1);
    }
    if (reason) return reason;
  }
  if (createsChannelTag && pushes) return PROMOTE_REASON;
  return null;
}

/** The MCP tool that promotes a release channel (any server prefix). */
function isPromoteTool(toolName) {
  return typeof toolName === 'string' && /(?:^|__)ship_promote$/.test(toolName);
}

module.exports = { destructiveReason, isPromoteTool, segments, tokens, insideSafe };
