/**
 * @module ship-guard-match
 * @version 0.5.0
 * @description Pure matcher for pre.ship.guard — decides whether a Bash command
 *   is a REAL manual PR create/merge invocation that must go through /do-ship.
 *
 *   Holds the gh call matching pre.issue.guard shares (issue-guard-match.js):
 *   line continuations joined, env prefixes and wrappers, a path to the binary,
 *   `gh.exe`, any case, gh's global flags before or after the group.
 *   A `gh api` call to a merge endpoint counts only when it writes: an explicit
 *   write method or a field. A plain GET reads the merge status.
 *
 *   Split out of pre.ship.guard.js so the logic is unit-testable, and to fix the
 *   #198 bonus defect: the old guard tested its patterns against the entire
 *   command string, so it false-positived when "gh pr create" merely appeared
 *   inside quoted text (an issue body, a commit message, a here-string) rather
 *   than as an actual invocation.
 *
 *   Two-stage match:
 *     1. maskQuoted() blanks quoted spans (single/double quotes, PowerShell
 *        here-strings, bash heredoc bodies) so embedded prose can't trip it.
 *     2. The patterns are anchored to a command position (start of command or
 *        right after a shell separator) so only real command tokens match, not
 *        arbitrary substrings.
 *
 *   gitSegments also follows shell wrappers (`bash -c '…'`, `cmd /c …`,
 *   `pwsh -c …`, a here-doc fed to a bare shell; lib/shell-inner.js, depth 3):
 *   their inner git calls are returned with the directory in effect there.
 *
 *   This is a nudge, not a security boundary — over-stripping quotes is fine; the
 *   goal is zero false positives on documentation/quoted text while still
 *   catching the direct `gh pr create …` invocations Claude actually issues.
 */

// A command position: start of string, or immediately after a shell separator
// (newline, ; & | ( ) { }). `&&` / `||` are covered by the single & / | chars.
const BOUNDARY = String.raw`(?:^|[\n;&|(){}])\s*`;

// A gh call at a command position: also after a backtick, behind env assignments
// and wrappers, with a path to the binary.
const GH_CALL = String.raw`(?:^|[\n;&|(){}\x60])[ \t]*`
  + String.raw`(?:(?:env|command|exec|sudo|time|nohup)[ \t]+|[A-Za-z_][A-Za-z0-9_]*=\S*[ \t]+)*`
  + String.raw`(?:[^\s;&|()]*[\\/])?gh(?:\.exe)?`;

/** A gh flag, optionally with a value that is not itself one of `keywords`. */
function ghFlag(keywords) {
  const stop = keywords.map((k) => k + String.raw`\b`).join('|');
  return String.raw`[ \t]+-{1,2}[\w-]+(?:=\S*|[ \t]+(?!${stop}|-)[^\s;&|]+)?`;
}

/** `gh <group> <verb>` with global flags around the group; `m[1]` is the verb. */
function ghVerbRe(group, verbs) {
  const flag = ghFlag([group, ...verbs, 'api']);
  return new RegExp(
    GH_CALL + `(?:${flag})*` + String.raw`[ \t]+` + group + `(?:${flag})*` + String.raw`[ \t]+(${verbs.join('|')})\b`,
    'gi'
  );
}

/** `gh api` at a command position: the rest of the segment decides. */
function ghApiRe(keywords) {
  return new RegExp(GH_CALL + `(?:${ghFlag(keywords)})*` + String.raw`[ \t]+api\b`, 'gi');
}

const PR_WRITE_RE = ghVerbRe('pr', ['create', 'merge']);
const PR_API_RE = ghApiRe(['pr', 'create', 'merge', 'api']);
const API_MERGE_PATH_RE = /(?:^|\s)\S*pulls\/[^\s/?]+\/merge(?:\?\S*)?(?=\s|$)/i;
const API_METHOD_RE = /(?:^|\s)(?:-X|--method)(?:[ \t]+|=)?([A-Za-z]+)/;
const API_WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const API_FIELD_RE = /(?:^|\s)(?:-[fF]|--field|--raw-field|--input)/;
/** Separators that end a command segment (after quote masking). */
const SEGMENT_END_RE = /[\n;|&]/;

/**
 * Join line continuations: bash `\` + newline, PowerShell backtick + newline.
 * @param {string} cmd
 */
function joinContinuations(cmd) {
  return cmd.replace(/\\\r?\n/g, '  ').replace(/\x60\r?\n/g, '  ');
}

/**
 * Where the segment starting at `from` ends in the masked command, and the
 * index of its unquoted `#` comment (or -1).
 */
function segmentBounds(masked, from) {
  const rest = masked.slice(from);
  const sep = rest.search(SEGMENT_END_RE);
  const end = sep === -1 ? masked.length : from + sep;
  const hash = masked.slice(from, end).indexOf('#');
  return { end, hash: hash === -1 ? -1 : from + hash };
}

/** Does this `gh api` segment write? An explicit method decides, else a field does. */
function isApiWrite(args) {
  const method = API_METHOD_RE.exec(args);
  if (method) return API_WRITE_METHODS.has(method[1].toUpperCase());
  return API_FIELD_RE.test(args);
}

/**
 * Remove quoted / here-doc spans so command words inside prose don't match.
 * Order matters: multi-line here-strings and heredocs first (they contain
 * quotes), then plain double- then single-quoted spans.
 *
 * @param {string} s
 * @returns {string}
 */
function stripQuoted(s) {
  return replaceQuoted(s, () => ' ');
}

/**
 * Like stripQuoted, but each removed span becomes the same number of spaces,
 * so offsets in the result are offsets in the original command.
 * @param {string} s
 * @returns {string}
 */
function maskQuoted(s) {
  return replaceQuoted(s, (m) => ' '.repeat(m.length));
}

/**
 * Like maskQuoted, but each removed span becomes underscores, so a quoted
 * argument (`git -C "my dir" commit`) stays one non-space token and the git
 * option matcher can step over it. Offsets are preserved.
 * @param {string} s
 * @returns {string}
 */
function maskQuotedToken(s) {
  return replaceQuoted(s, (m) => '_'.repeat(m.length));
}

// The global options git takes before its subcommand: `-C <dir>`, `-c k=v`,
// `--git-dir[=]<p>`, `--work-tree[=]<p>`, `--no-pager` and friends. Leading
// `VAR=value` assignments are a command prefix as well.
const ENV_PREFIX = String.raw`(?:[A-Za-z_]\w*=\S*\s+)*`;
const GIT_GLOBAL_OPTS = String.raw`(?:\s+(?:-C\s+\S+|-c\s+\S+|--(?:git-dir|work-tree|namespace)(?:=\S+|\s+\S+)|--no-pager|--paginate|-p|--bare|--no-replace-objects|--literal-pathspecs))*`;
/** The end of a subcommand word: whitespace, a separator, or the end. */
const WORD_END = String.raw`(?=[\s;&|(){}]|$)`;

/**
 * A regex for a real `git … <subcommand…>` invocation at a command position —
 * chained (`a && git commit`), with global options (`git -C . commit`,
 * `git -c k=v commit`) or env prefixes. Run it on maskQuotedToken() output.
 * @param {string} rest regex source for the subcommand and what follows
 * @returns {RegExp}
 */
function gitCommandRe(rest) {
  return new RegExp(BOUNDARY + ENV_PREFIX + String.raw`git(?:\.exe)?` + GIT_GLOBAL_OPTS + String.raw`\s+` + rest, 'm');
}

/**
 * Does `cmd` invoke git with one of the subcommand patterns? Quoted text,
 * heredoc bodies and here-strings never match.
 * @param {string} cmd
 * @param {RegExp[]} res built by gitCommandRe
 * @returns {boolean}
 */
function matchesGitCommand(cmd, res) {
  if (!cmd || typeof cmd !== 'string') return false;
  const masked = maskQuotedToken(cmd);
  return res.some((re) => re.test(masked));
}

function replaceQuoted(s, fill) {
  let out = s;
  // PowerShell here-strings: @"..."@ and @'...'@ (may span lines)
  out = out.replace(/@"[\s\S]*?"@/g, fill);
  out = out.replace(/@'[\s\S]*?'@/g, fill);
  // Bash heredocs: <<['"]?TAG ... \n TAG  (optional <<- dash, quoted/unquoted tag)
  out = out.replace(/<<-?\s*(['"]?)([A-Za-z_]\w*)\1[\s\S]*?\n[ \t]*\2\b/g, fill);
  // Remaining double- then single-quoted spans
  out = out.replace(/"[^"]*"/g, fill);
  out = out.replace(/'[^']*'/g, fill);
  return out;
}

/**
 * @param {string} cmd  Raw Bash or PowerShell command from the tool input.
 * @returns {boolean}   true only for a real manual PR create/merge invocation.
 */
function isManualShipCommand(cmd) {
  if (!cmd || typeof cmd !== 'string') return false;
  const joined = joinContinuations(cmd);
  const masked = maskQuoted(joined);
  if ([...masked.matchAll(PR_WRITE_RE)].length) return true;
  for (const m of masked.matchAll(PR_API_RE)) {
    const from = m.index + m[0].length;
    const { end, hash } = segmentBounds(masked, from);
    const args = joined.slice(from, hash === -1 ? end : hash).replace(/["']/g, '');
    if (API_MERGE_PATH_RE.test(args) && isApiWrite(args)) return true;
  }
  return false;
}

// ── the directory a git command acts on ─────────────────────────────────────

const { SHELLS, MAX_DEPTH, headName, innerCommand, shellHeredocBody } = require('./shell-inner');

const WRAPPERS = new Set(['env', 'command', 'exec', 'sudo', 'time', 'nohup']);

/** Index of the command word in `toks`: past env assignments and wrapper commands. */
function skipPrefix(toks) {
  let i = 0;
  while (i < toks.length && (/^[A-Za-z_]\w*=/.test(toks[i]) || WRAPPERS.has(toks[i].toLowerCase()))) i++;
  return i;
}
const DIR_CHANGERS = new Set(['cd', 'chdir', 'pushd', 'set-location', 'sl', 'push-location', 'popd', 'pop-location']);
const DIR_PUSHERS = new Set(['pushd', 'push-location']);
const DIR_POPPERS = new Set(['popd', 'pop-location']);

/** Directory a `--git-dir` / `GIT_DIR` value stands for: `<work tree>/.git` → the work tree. */
function gitDirTarget(base, value) {
  const d = resolveDir(base, value);
  if (!d) return null;
  return /^\.git$/i.test(require('path').basename(d)) ? require('path').dirname(d) : d;
}

/**
 * Is this git segment a pure fast-forward of main/master to its remote
 * (`git merge --ff-only <remote>/main`, `git pull --ff-only [<remote> [main]]`)?
 * That moves the ref to what the remote already has and is no own work on
 * main — the post-ship "local main up to date" step. Everything else (another
 * branch, no --ff-only, extra options) is not.
 * @param {string} text one command segment as typed
 * @returns {boolean}
 */
function isFastForwardOfMain(text) {
  const toks = shellTokens(text || '');
  let i = 0;
  while (i < toks.length && (/^[A-Za-z_]\w*=/.test(toks[i]) || WRAPPERS.has(toks[i].toLowerCase()))) i++;
  if (!/^git(?:\.exe)?$/i.test((toks[i] || '').replace(/^.*[\\/]/, ''))) return false;
  i++;
  for (; i < toks.length && toks[i].startsWith('-'); i++) {
    if (toks[i] === '-C' || toks[i] === '-c') i++;
    else if (/^--(?:git-dir|work-tree|namespace)$/.test(toks[i])) i++;
  }
  const sub = (toks[i] || '').toLowerCase();
  if (sub !== 'merge' && sub !== 'pull') return false;
  const rest = toks.slice(i + 1);
  if (!rest.includes('--ff-only')) return false;
  const args = rest.filter(t => !t.startsWith('-'));
  if (rest.some(t => t.startsWith('-') && !['--ff-only', '-q', '--quiet', '-v', '--verbose'].includes(t))) return false;
  const NAME = /^[A-Za-z0-9._-]+$/;
  const BRANCH = /^(?:main|master)$/i;
  if (sub === 'merge') {
    const m = args.length === 1 ? /^([A-Za-z0-9._-]+)\/(.+)$/.exec(args[0]) : null;
    return Boolean(m) && NAME.test(m[1]) && BRANCH.test(m[2]);
  }
  if (args.length > 2 || args.some(a => !NAME.test(a))) return false;
  return args.length < 2 || BRANCH.test(args[1]);
}

/** Quote-aware whitespace split; quotes are stripped, backslashes stay (Windows paths). */
function shellTokens(text) {
  const out = [];
  let cur = '';
  let q = null;
  let has = false;
  for (const ch of text) {
    if (q) { if (ch === q) q = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; has = true; continue; }
    if (/\s/.test(ch)) { if (cur || has) out.push(cur); cur = ''; has = false; continue; }
    cur += ch;
  }
  if (cur || has) out.push(cur);
  return out;
}

/**
 * `arg` relative to `base`; null when the shell, not this parser, decides it
 * (variable, substitution, `cd -`, glob, unknown base for a relative path).
 */
function resolveDir(base, arg) {
  if (typeof arg !== 'string' || !arg || /[$%\x60*?]/.test(arg) || arg === '-') return null;
  const path = require('path');
  let a = arg;
  if (a === '~' || a.startsWith('~/') || a.startsWith('~\\')) a = require('os').homedir() + a.slice(1);
  // Git Bash writes drive paths as /c/dir.
  if (process.platform === 'win32') a = a.replace(/^\/([A-Za-z])(?=\/|$)/, (_m, d) => `${d.toUpperCase()}:`);
  if (!path.isAbsolute(a) && !base) return null;
  const full = path.resolve(base || '/', a);
  // A target that does not exist is unknown, not a place: the failed `cd typo`
  // leaves the shell where it was, so the write must fall back to the cwd.
  try { if (!require('fs').statSync(full).isDirectory()) return null; } catch { return null; }
  return full;
}

/**
 * Every command segment of `cmd` with the directory it acts on: the session's
 * `cwd` moved by earlier `cd <dir>` / `pushd <dir>` / `Set-Location <dir>`
 * segments, then by the `-C <dir>` options of the git call itself. `dir` is
 * null when it cannot be read (variable, `--git-dir`, `cd -` …); the caller
 * then falls back to the cwd. Only segments with a git call are returned;
 * `text` is the segment as typed, for the caller's own matchers.
 *
 * @param {string} cmd
 * @param {string} cwd
 * @returns {{text: string, dir: string|null}[]}
 */
function gitSegments(cmd, cwd, depth = 0) {
  if (!cmd || typeof cmd !== 'string') return [];
  const joined = joinContinuations(cmd);
  const masked = maskQuotedToken(joined);
  const sep = /[\n;&|(){}]/g;
  const spans = [];
  let start = 0;
  let opener = '';
  for (let m; (m = sep.exec(masked)); start = m.index + 1) { spans.push([start, m.index, opener]); opener = m[0]; }
  spans.push([start, masked.length, opener]);
  let shellDir = cwd || null;
  // A `cd` inside `( … )` ends with the subshell: the directory before it is back.
  const saved = [];
  const dirStack = [];
  const out = [];
  for (const [a, b, before] of spans) {
    if (before === '(') saved.push(shellDir);
    else if (before === ')' && saved.length) shellDir = saved.pop();
    const text = joined.slice(a, b);
    const toks = shellTokens(text);
    const i = skipPrefix(toks);
    const env = {};
    for (let k = 0; k < i; k++) {
      const em = /^(GIT_DIR|GIT_WORK_TREE)=(.*)$/.exec(toks[k]);
      if (em) env[em[1]] = em[2];
    }
    // A shell that runs another command: the inner command is judged on its own,
    // starting in the directory in effect here; a `cd` inside does not leak out.
    if (depth < MAX_DEPTH) {
      const shell = headName(toks[i]);
      const inner = SHELLS.has(shell) ? innerCommand(toks.slice(i), shell) : null;
      const body = inner || shellHeredocBody(text, shellTokens, skipPrefix);
      if (body) { out.push(...gitSegments(body, shellDir, depth + 1)); continue; }
    }
    const head = (toks[i] || '').replace(/^.*[\\/]/, '').toLowerCase();
    if (DIR_POPPERS.has(head)) { shellDir = dirStack.length ? dirStack.pop() : null; continue; }
    if (DIR_CHANGERS.has(head)) {
      if (DIR_PUSHERS.has(head)) dirStack.push(shellDir);
      const arg = toks.slice(i + 1).find((t) => !t.startsWith('-') && !/^\/[a-z]$/i.test(t));
      shellDir = arg === undefined ? null : resolveDir(shellDir, arg);
      continue;
    }
    if (head !== 'git' && head !== 'git.exe') continue;
    let dir = shellDir;
    let j = i + 1;
    let workTree = null;
    let gitDir = null;
    for (; j < toks.length && toks[j].startsWith('-'); j++) {
      const t = toks[j];
      if (t === '-C') { dir = resolveDir(dir, toks[++j]); } else if (t === '-c') j++;
      else if (/^--(?:git-dir|work-tree)/.test(t)) {
        const eq = t.indexOf('=');
        const val = eq === -1 ? toks[++j] : t.slice(eq + 1);
        if (t.startsWith('--work-tree')) workTree = val; else gitDir = val;
      } else if (t === '--namespace') j++;
    }
    // The option beats the env var; a work tree beats a git dir. A value that
    // cannot be read leaves the directory unknown (the caller uses the cwd).
    workTree = workTree !== null ? workTree : env.GIT_WORK_TREE;
    gitDir = gitDir !== null ? gitDir : env.GIT_DIR;
    if (workTree !== undefined && workTree !== null) dir = resolveDir(dir, workTree);
    else if (gitDir !== undefined && gitDir !== null) dir = gitDirTarget(dir, gitDir);
    out.push({ text, dir });
  }
  return out;
}

// Options `git push` may carry in a pure remote-branch delete. Anything else
// (--force, --mirror, --all, --prune, --tags, -u ...) makes the push a real one.
const DELETE_SAFE_OPTS = new Set(['-d', '--delete', '-q', '--quiet', '-v', '--verbose', '-n', '--dry-run', '--no-verify', '--porcelain']);
// A token with shell syntax (substitution, redirect, subshell, leftover quote,
// glob) cannot be read as a plain ref name.
const SHELL_SYNTAX = /[$`<>(){}'"*?\\]/;
// Remote names and ref specs are an allowlist, not a denylist: anything else
// (`,` `@` `[` `~` `!` `#` `%` …) may be read differently by bash, PowerShell
// or git and never counts as a plain name.
const PLAIN_SPEC = /^:?[A-Za-z0-9._/-]+$/;

/**
 * The remote refs a command deletes, when EVERY `git push` in it is a pure
 * delete (`git push <remote> --delete|-d <ref>...` or `git push <remote> :<ref>...`).
 * null when a push in it does anything else, a token is not a plain ref name,
 * or there is no push. Refs are returned without `refs/heads/` / `heads/` and
 * the leading `:`; fully quoted refs are unquoted. A ref in another namespace
 * (`refs/tags/…`, `refs/remotes/…`) makes it null.
 * @param {string} cmd
 * @returns {string[]|null}
 */
function remoteDeleteRefs(cmd) {
  const t = remoteDeleteTargets(cmd);
  return t ? t.refs : null;
}

/**
 * remoteDeleteRefs plus the remotes the deletes go to.
 * @param {string} cmd
 * @returns {{remotes: string[], refs: string[]}|null}
 */
function remoteDeleteTargets(cmd) {
  if (!cmd || typeof cmd !== 'string') return null;
  const masked = maskQuotedToken(cmd);
  const pushRe = gitCommandRe(String.raw`push` + WORD_END);
  const refs = [];
  const remotes = new Set();
  let pushes = 0;
  // Split at shell separators; offsets stay aligned with the original command.
  const sep = /&&|\|\||[;|&\n]/g;
  let start = 0;
  const segments = [];
  for (let m; (m = sep.exec(masked)); start = m.index + m[0].length) segments.push([start, m.index]);
  segments.push([start, masked.length]);
  for (const [a, b] of segments) {
    const seg = masked.slice(a, b);
    const hit = pushRe.exec(seg);
    if (!hit) continue;
    pushes++;
    const tokens = [];
    const tokRe = /\S+/g;
    tokRe.lastIndex = hit.index + hit[0].length;
    for (let t; (t = tokRe.exec(seg));) {
      tokens.push(cmd.slice(a + t.index, a + t.index + t[0].length).replace(/^(['"])(.*)\1$/, '$2'));
    }
    let del = false;
    const pos = [];
    for (const t of tokens) {
      if (SHELL_SYNTAX.test(t)) return null;
      if (t.startsWith('-')) {
        if (!DELETE_SAFE_OPTS.has(t)) return null;
        if (t === '-d' || t === '--delete') del = true;
      } else if (PLAIN_SPEC.test(t)) pos.push(t);
      else return null;
    }
    if (pos.length < 2 || pos[0].startsWith(':')) return null; // remote + at least one ref
    remotes.add(pos[0]);
    for (const spec of pos.slice(1)) {
      if (!del && !spec.startsWith(':')) return null;
      // git DWIMs `heads/main` to refs/heads/main as well
      const name = spec.replace(/^:/, '').replace(/^(?:refs\/)?heads\//, '');
      if (!name || name.includes(':') || name.startsWith('refs/')) return null;
      refs.push(name);
    }
  }
  return pushes ? { remotes: [...remotes], refs } : null;
}

module.exports = {
  isManualShipCommand, stripQuoted, maskQuoted, maskQuotedToken,
  ghVerbRe, ghApiRe, joinContinuations, segmentBounds, isApiWrite,
  gitSegments, isFastForwardOfMain, BOUNDARY, WORD_END, gitCommandRe, matchesGitCommand, remoteDeleteRefs, remoteDeleteTargets,
};
