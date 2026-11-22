#!/usr/bin/env node
/**
 * @hook prompt.thread.notices
 * @version 0.1.0
 * @event UserPromptSubmit
 * @plugin devops
 * @description Keeps the SessionStart notices for the Desktop user ("Show the
 *   user this line verbatim" — version notice, budget login, orphan nudge,
 *   backup / MCP / mods / team lines) out of a Claude Projects thread. The
 *   person there sees only what the thread posts; such a line would arrive as
 *   a stray post. A session is known as a thread only from its first wake
 *   prompt, after SessionStart ran, so this ONE central hook neutralises every
 *   emitter at once: it adds a single context line on the first thread prompt
 *   (once per session). Feature `project-threads` (mode `on`) only; a Desktop
 *   or terminal session gets nothing.
 */

require('../lib/plugin-guard');

const { sessionFile, readSessionFile, writeSessionFile } = require('../lib/session-id');

const FLAG = 'dotclaude-devops-thread-notices';

const LINE =
  '[thread-notices] Session-start notices ("show the user this line verbatim": versions, budget login, ' +
  'orphan / backup / MCP / team lines) are for the Desktop user. Do not post them into this thread.';

/** @returns {string|null} the context line, or null (not a thread, feature off, already said). */
function decide({ mode, said }) {
  if (mode !== 'on' || said) return null;
  return LINE;
}

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { input += d; });
  process.stdin.on('end', () => {
    let hook;
    try { hook = JSON.parse(input); } catch { process.exit(0); }
    try {
      const P = require('../lib/project-thread');
      const mode = P.threadMode(hook, { deep: true });
      const said = readSessionFile(FLAG, hook.session_id, { exact: true }) !== null;
      const line = decide({ mode, said });
      if (!line) process.exit(0);
      try { writeSessionFile(sessionFile(FLAG, hook.session_id), '1'); } catch { /* advisory: worst case the line repeats */ }
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: line } }));
    } catch { /* advisory */ }
    process.exit(0);
  });
}

module.exports = { decide, LINE, FLAG };
