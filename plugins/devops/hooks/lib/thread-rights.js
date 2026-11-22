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
 */

const os = require('os');
const path = require('path');

/** Split a command line into segments at `;`, `&&`, `||`, `|`, `&` and newlines (outside quotes). */
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
    if (ch === ';' || ch === '\n' || ch === '|' || ch === '&') {
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

function pushReason(t) {
  const args = t.slice(2);
  for (const a of args) {
    if (a === '--force' || a === '-f' || a.startsWith('--force-with-lease') || a === '--force-if-includes') return 'a force-push';
    if (/^-[a-zA-Z]+$/.test(a) && a.includes('f')) return 'a force-push';
    if (a === '--delete' || a === '-d') return 'a remote branch delete';
    if (a.startsWith('+') && a.length > 1) return 'a force-push (+refspec)';
    if (a.startsWith(':') && a.length > 1) return 'a remote branch delete (:ref)';
  }
  return null;
}

function rmReason(t, cwd) {
  const flags = t.slice(1).filter((a) => /^-/.test(a));
  const recursive = flags.some((a) => a === '--recursive' || (/^-[a-zA-Z]+$/.test(a) && /[rR]/.test(a)));
  if (!recursive) return null;
  const targets = t.slice(1).filter((a) => !/^-/.test(a));
  if (!targets.length) return null;
  return targets.every((p) => insideSafe(p, cwd)) ? null : 'a recursive delete outside the scratch and temp folders';
}

function removeItemReason(t, cwd) {
  const recursive = t.slice(1).some((a) => /^-r(e(c(u(r(se?)?)?)?)?)?$/i.test(a));
  if (!recursive) return null;
  const targets = [];
  for (let i = 1; i < t.length; i++) {
    const a = t[i];
    if (/^-(path|literalpath)$/i.test(a) && t[i + 1]) { targets.push(t[++i]); continue; }
    if (/^-/.test(a)) { if (/^-(filter|include|exclude|credential|stream)$/i.test(a)) i++; continue; }
    targets.push(a);
  }
  if (!targets.length) return null;
  return targets.every((p) => insideSafe(p, cwd)) ? null : 'a recursive delete outside the scratch and temp folders';
}

/** Strip a leading env assignment and `sudo`, return the token list for one segment. */
function commandTokens(segment) {
  const t = tokens(segment);
  while (t.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0]) || t[0] === 'sudo' || t[0] === 'command')) t.shift();
  // `git -C dir …` / `git -c k=v …`: drop the global options so the verb is t[1]
  if (t[0] === 'git') {
    let i = 1;
    while (i < t.length && /^-/.test(t[i])) i += (t[i] === '-C' || t[i] === '-c' || t[i] === '--git-dir' || t[i] === '--work-tree') ? 2 : 1;
    return ['git', ...t.slice(i)];
  }
  return t;
}

/**
 * The reason `command` is destructive, or null.
 * @param {string} command
 * @param {string} [cwd] the session's working directory (relative delete targets)
 * @returns {string|null}
 */
function destructiveReason(command, cwd) {
  for (const seg of segments(command)) {
    const t = commandTokens(seg);
    if (!t.length) continue;
    const head = t[0].replace(/\.exe$/i, '').toLowerCase();
    let reason = null;
    if (head === 'git') {
      if (t[1] === 'push') reason = pushReason(t);
      else if (t[1] === 'branch') reason = t.slice(2).some((a) => a === '-D' || (/^-[a-zA-Z]+$/.test(a) && a.includes('D'))) ? 'a branch delete (git branch -D)' : null;
      else if (t[1] === 'worktree' && t[2] === 'remove') reason = t.slice(3).some((a) => a === '--force' || a === '-f') ? 'a forced worktree removal' : null;
    } else if (head === 'gh') {
      if (t[1] === 'repo' && t[2] === 'delete') reason = 'a repository delete';
      else if (t[1] === 'release' && t[2] === 'delete') reason = 'a release delete';
    } else if (head === 'rm') {
      reason = rmReason(t, cwd);
    } else if (head === 'remove-item' || head === 'ri') {
      reason = removeItemReason(t, cwd);
    }
    if (reason) return reason;
  }
  return null;
}

module.exports = { destructiveReason, segments, tokens, insideSafe };
