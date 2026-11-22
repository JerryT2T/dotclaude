#!/usr/bin/env node
/**
 * @hook prompt.thread.notices
 * @version 0.2.0
 * @event UserPromptSubmit
 * @plugin devops
 * @description Two things at the first prompts of a Claude Projects thread.
 *   Feature `project-threads` (mode `on`) only; a Desktop or terminal session
 *   gets nothing.
 *   1. Session-start notices for the Desktop user ("Show the user this line
 *      verbatim") stay out of a thread. The dispatcher already holds them back
 *      by code (lib/thread-notice-hold.js); this hook's one-line request is the
 *      fallback for a thread session WITHOUT the hold marker (started before
 *      that change), once per session.
 *   2. One setup hint per new Claude Project: two entries the plugin cannot
 *      make (Project settings > Plugins, Project settings > Memory > Project
 *      instructions). On the first wake of a thread in a project not yet
 *      recorded in ~/.claude/devops-thread-seen.json, one context block asks
 *      the model to append a short note to its first reply; the project is
 *      recorded when the block is emitted. Not in a cloud container
 *      (CLAUDE_CODE_REMOTE=true): its state does not persist, the hint would
 *      repeat in every thread.
 */

require('../lib/plugin-guard');

const path = require('path');
const { sessionFile, readSessionFile, writeSessionFile } = require('../lib/session-id');

const FLAG = 'dotclaude-devops-thread-notices';

const LINE =
  '[thread-notices] Session-start notices ("show the user this line verbatim": versions, budget login, ' +
  'orphan / backup / MCP / team lines) are for the Desktop user. Do not post them into this thread.';

const SNIPPET_REL = 'deep-knowledge/project-instructions-snippet.md';

const HINT_TEXT = {
  en: 'Setup for this project: it is new to devops, and two entries are probably still missing (the plugin cannot verify them). ' +
    '(1) Project settings > Plugins: add devops. (2) Project settings > Memory > Project instructions: add the devops text. ' +
    'Reply "show the text" and I post it here, or ask Claude in the project chat to add it.',
  de: 'Einrichtung für dieses Projekt: es ist neu für devops, und zwei Einträge fehlen vermutlich noch (das Plugin kann sie nicht prüfen). ' +
    '(1) Projekteinstellungen > Plugins: devops hinzufügen. (2) Projekteinstellungen > Memory > Projektanweisungen: den devops-Text eintragen. ' +
    'Antworte „Text zeigen“, dann poste ich ihn hier, oder bitte Claude im Projekt-Chat, ihn einzutragen.',
};

/** @returns {string|null} the context line, or null (not a thread, feature off, already said, or held back by code). */
function decide({ mode, said, held = false }) {
  if (mode !== 'on' || said || held) return null;
  return LINE;
}

/**
 * The one-time setup hint for a project, or null.
 * @param {{ mode: string, projectId: string, hinted: boolean, remote: boolean, lang?: string, pluginRoot?: string }} o
 * @returns {string|null}
 */
function hint({ mode, projectId, hinted, remote, lang = 'de', pluginRoot = path.resolve(__dirname, '..', '..') }) {
  if (mode !== 'on' || !projectId || hinted || remote) return null;
  const snippet = path.join(pluginRoot, SNIPPET_REL).replace(/\\/g, '/');
  return '[thread-hint] This Claude Project is new to devops (once per project, never again). ' +
    "Append a short note to your FIRST reply in this thread (the thread post, in the person's language), in these words: " +
    `"${HINT_TEXT[lang === 'en' ? 'en' : 'de']}" ` +
    `When the person asks for the text: read ${snippet} and post its code block verbatim as a reply in this thread.`;
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
      if (mode !== 'on') process.exit(0);
      const parts = [];
      const held = require('../lib/thread-notice-hold').holdActive(hook.session_id);
      const said = readSessionFile(FLAG, hook.session_id, { exact: true }) !== null;
      const line = decide({ mode, said, held });
      if (line) {
        try { writeSessionFile(sessionFile(FLAG, hook.session_id), '1'); } catch { /* advisory: worst case the line repeats */ }
        parts.push(line);
      }
      try {
        const seen = require('../lib/thread-seen');
        const id = P.projectId(typeof hook.prompt_raw === 'string' ? hook.prompt_raw : hook.prompt);
        let lang = 'de';
        try { lang = require('../lib/locale').getLocale(hook.session_id); } catch { /* default */ }
        const text = hint({ mode, projectId: id, hinted: seen.projectHinted(id), remote: process.env.CLAUDE_CODE_REMOTE === 'true', lang });
        if (text) { seen.markProjectHinted(id); parts.push(text); }
      } catch { /* advisory */ }
      if (!parts.length) process.exit(0);
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: parts.join('\n\n') } }));
    } catch { /* advisory */ }
    process.exit(0);
  });
}

module.exports = { decide, hint, LINE, FLAG, HINT_TEXT };
