/**
 * @module shell-inner
 * @version 0.1.0
 * @description One reading of "a shell that runs another command", shared by
 *   thread-rights.js (destructive-command scan) and ship-guard-match.js
 *   (gitSegments → pre.main.guard): the inner command of
 *   `bash|sh|zsh|dash|ksh -c '…'` (also `-lc`, `-ec`), `cmd /c …`,
 *   `pwsh|powershell -c|-Command …`, and the body of a here-doc fed to a shell
 *   (`bash <<'EOF'`, `bash -s <<EOF`, `sh <<-EOF`).
 *
 *   Pure string work; no I/O. Callers recurse into the inner command with their
 *   own depth cap (MAX_DEPTH).
 */

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'cmd', 'pwsh', 'powershell']);
/** How many shell levels deep callers follow (`bash -c "sh -c '…'"` is level 2). */
const MAX_DEPTH = 3;

/** The command name of a token: no directory, no leading backslash, no `.exe`, lower case. */
function headName(tok) {
  return String(tok || '').replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase();
}

/** The inner command of a shell call (`bash -c '…'`, `cmd /c …`, `powershell -Command …`), or ''. */
function innerCommand(t, head) {
  const flag = head === 'cmd' ? /^\/[ck]$/i : head === 'pwsh' || head === 'powershell' ? /^-(c|command)$/i : /^-[a-zA-Z]*c$/;
  const i = t.findIndex((a, n) => n > 0 && flag.test(a));
  return i === -1 ? '' : t.slice(i + 1).join(' ');
}

const HEREDOC_RE = /<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?:\n|$)/;

/**
 * The body of a here-doc whose receiver is a bare shell: `bash <<'EOF'`,
 * `bash -s <<EOF`, `sh <<-EOF`. null for any other receiver (`cat > f <<EOF`,
 * `bash script.sh <<EOF`, `bash -c '…' <<EOF`, `gh … "$(cat <<EOF …)"`).
 * @param {string} text one command segment as typed
 * @param {(text: string) => string[]} tokenize quote-aware tokenizer of the caller
 * @param {(toks: string[]) => number} skipPrefix index of the command word after env/wrappers
 * @returns {string|null}
 */
function shellHeredocBody(text, tokenize, skipPrefix) {
  const m = HEREDOC_RE.exec(text);
  if (!m) return null;
  const toks = tokenize(text.slice(0, m.index));
  const i = skipPrefix(toks);
  if (!SHELLS.has(headName(toks[i])) || headName(toks[i]) === 'cmd') return null;
  const rest = toks.slice(i + 1);
  if (!rest.every((a) => /^-[a-zA-Z]+$|^--$/.test(a) && !/^-[a-zA-Z]*c/.test(a))) return null;
  return m[3];
}

module.exports = { SHELLS, MAX_DEPTH, headName, innerCommand, shellHeredocBody };
