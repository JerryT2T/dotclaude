#!/usr/bin/env node
/**
 * @hook prompt.thread.notices
 * @version 0.4.0
 * @event UserPromptSubmit
 * @plugin devops
 * @description Four things at the first prompts of a Claude Projects thread.
 *   Feature `project-threads` (mode `on`) only; a Desktop or terminal session
 *   gets nothing.
 *   1. Session-start notices for the Desktop user ("Show the user this line
 *      verbatim") stay out of a thread. The dispatcher already holds them back
 *      by code (lib/thread-notice-hold.js); this hook's one-line request is the
 *      fallback for a thread session WITHOUT the hold marker (started before
 *      that change), once per session.
 *   2. One setup hint per new Claude Project, for entries the plugin cannot
 *      make: devops is enabled once for the claude.ai account (Plugins, not per
 *      project); the devops text and the "Where threads run" block go into
 *      Project settings > Memory > Project instructions; local threads need
 *      Environment > "Your computer" on. On the first wake of a thread in a
 *      project not yet recorded in ~/.claude/devops-thread-seen.json
 *      (`projects`), one context block asks the model to append a short note to
 *      its first reply; the project is recorded when the block is emitted.
 *      When the person asks for the text, the model posts the FIRST fenced
 *      block of the snippet doc (devops text) and the output of
 *      `scripts/thread-location.js block --project <id>` (the location block
 *      for the value in effect there).
 *   3. One block check per project and block version/value. A local thread
 *      starts with the project instructions in its context; a context block asks
 *      the model to look there for the marker line `Where threads run (devops
 *      <value>, v<N>)` and to append ONE hint when it is missing or outdated
 *      (cloud-first: when a block is still there). Recorded in the sibling map
 *      `blockChecked` (id → `<value>@v<N>`) when the block is emitted, so a
 *      changed value or a new block version asks once again. A project that
 *      gets hint 2 in the same prompt gets that note only (it covers the
 *      block). This is a working rule for the model, NOT a check by code: the
 *      plugin cannot read the project instructions.
 *   4. A readable name for the Home pane: the envelope carries only the
 *      project id, so the folder of the first local thread (its main checkout)
 *      is recorded once as the project's name (`projectNames`); a name the user
 *      gave with `scripts/thread-location.js name` stays.
 *   Neither 2, 3 nor 4 runs in a cloud container (CLAUDE_CODE_REMOTE=true): its state does
 *   not persist, the hint would repeat in every thread.
 */

require('../lib/plugin-guard');

const path = require('path');
const { sessionFile, readSessionFile, writeSessionFile } = require('../lib/session-id');

const FLAG = 'dotclaude-devops-thread-notices';

const LINE =
  '[thread-notices] Session-start notices ("show the user this line verbatim": versions, budget login, ' +
  'orphan / backup / MCP / team lines) are for the Desktop user. Do not post them into this thread.';

const SNIPPET_REL = 'deep-knowledge/project-instructions-snippet.md';

/** The setup note; `withBlock` false (value cloud-first) leaves the "Where threads run" block out. */
function setupText(lang, withBlock) {
  if (lang === 'en') {
    return 'Setup for this project: it is new to devops, and some entries are probably still missing (the plugin cannot verify them). ' +
      '(1) devops is enabled once for your claude.ai account under Plugins, not per project. ' +
      `(2) Project settings > Memory > Project instructions: add the devops text${withBlock ? ' and the "Where threads run" block' : ''}. ` +
      '(3) For local threads: Project settings > Environment > "Your computer" on. ' +
      `Reply "show the text" and I post ${withBlock ? 'them' : 'it'} here, or ask Claude in the project chat to add ${withBlock ? 'them' : 'it'}.`;
  }
  return 'Einrichtung für dieses Projekt: es ist neu für devops, und einige Einträge fehlen vermutlich noch (das Plugin kann sie nicht prüfen). ' +
    '(1) devops wird einmal für dein claude.ai-Konto unter Plugins aktiviert, nicht pro Projekt. ' +
    `(2) Projekteinstellungen > Gedächtnis > Projektanweisungen: den devops-Text${withBlock ? ' und den Block „Where threads run“' : ''} eintragen. ` +
    '(3) Für lokale Threads: Umgebung > „Dein Computer“ einschalten. ' +
    `Antworte „Text zeigen“, dann poste ich ${withBlock ? 'sie' : 'ihn'} hier, oder bitte Claude im Projekt-Chat, ${withBlock ? 'sie' : 'ihn'} einzutragen.`;
}

/** The setup note for a project whose location value has a block (de + en). */
const HINT_TEXT = { en: setupText('en', true), de: setupText('de', true) };

/** The note when the project's "Where threads run" block is missing or outdated (de + en). */
const BLOCK_TEXT = {
  en: (m) => `The "Where threads run" block in this project's instructions is missing or outdated (current: ${m}). ` +
    'Reply "show the text" and I post the current block here. Paste it into Project settings > Memory > Project instructions.',
  de: (m) => `Der Block „Where threads run“ in den Projektanweisungen fehlt oder ist veraltet (aktuell: ${m}). ` +
    'Antworte „Text zeigen“, dann poste ich den aktuellen Block hier. Trage ihn unter Projekteinstellungen > Gedächtnis > Projektanweisungen ein.',
};

/** The reverse note for the value cloud-first: a block still in the instructions should go (de + en). */
const BLOCK_REMOVE_TEXT = {
  en: 'The project instructions still carry a "Where threads run (devops …)" block, but threads here are set to start in the cloud first. ' +
    'Remove that block under Project settings > Memory > Project instructions.',
  de: 'Die Projektanweisungen enthalten noch einen Block „Where threads run (devops …)“, Threads starten hier aber zuerst in der Cloud. ' +
    'Entferne den Block unter Projekteinstellungen > Gedächtnis > Projektanweisungen.',
};

/** @returns {string|null} the context line, or null (not a thread, feature off, already said, or held back by code). */
function decide({ mode, said, held = false }) {
  if (mode !== 'on' || said || held) return null;
  return LINE;
}

const scriptCmd = (pluginRoot, projectId) =>
  `node "${path.join(pluginRoot, 'scripts', 'thread-location.js').replace(/\\/g, '/')}" block --project ${projectId}`;

/**
 * The one-time setup hint for a project, or null. One combined note: it also
 * covers the "Where threads run" block, so the block check is not asked again.
 * @param {{ mode: string, projectId: string, hinted: boolean, remote: boolean, lang?: string, pluginRoot?: string, value?: string }} o
 *   `value`: the location value in effect (default `local-first`; `cloud-first` has no block).
 * @returns {string|null}
 */
function hint({ mode, projectId, hinted, remote, lang = 'de', pluginRoot = path.resolve(__dirname, '..', '..'), value = 'local-first' }) {
  if (mode !== 'on' || !projectId || hinted || remote) return null;
  const snippet = path.join(pluginRoot, SNIPPET_REL).replace(/\\/g, '/');
  const withBlock = value !== 'cloud-first';
  const how = withBlock
    ? `When the person asks for the text, post two things as replies in this thread: (a) the devops text: read ${snippet} and post its FIRST fenced block verbatim, ` +
      `(b) the location block for this project: run \`${scriptCmd(pluginRoot, projectId)}\` and post its plain output verbatim.`
    : `When the person asks for the text: read ${snippet} and post its FIRST fenced block verbatim as a reply in this thread. ` +
      'This project starts threads cloud-first and needs no "Where threads run" block.';
  return '[thread-hint] This Claude Project is new to devops (once per project, never again). ' +
    "Append a short note to your FIRST reply in this thread (the thread post, in the person's language), in these words: " +
    `"${setupText(lang === 'en' ? 'en' : 'de', withBlock)}" ${how}`;
}

/**
 * The once-per-project-and-block-version request to check the project
 * instructions for the "Where threads run" block, or null. A working rule for
 * the thread's model: the plugin cannot read the project instructions, so
 * nothing here verifies that the block is present or current.
 * @param {{ mode: string, projectId: string, remote: boolean, checked: boolean, value: string, version: number, lang?: string, pluginRoot?: string }} o
 *   `checked`: this project was already asked for this value and version.
 * @returns {string|null}
 */
function blockCheck({ mode, projectId, remote, checked, value, version, lang = 'de', pluginRoot = path.resolve(__dirname, '..', '..') }) {
  if (mode !== 'on' || !projectId || remote || checked || !value) return null;
  const l = lang === 'en' ? 'en' : 'de';
  const intro = '[thread-block-check] Once per project and block version. A local thread starts with this project\'s instructions in its context: look there yourself, nothing else checks it. ';
  const tail = "append ONE short hint to your FIRST reply in this thread (the thread post, in the person's language), in these words: ";
  if (value === 'cloud-first') {
    return `${intro}Search them for a line that starts with \`Where threads run (devops \`. None: say nothing. Found: ${tail}"${BLOCK_REMOVE_TEXT[l]}"`;
  }
  const marker = `devops ${value}, v${version}`;
  return `${intro}Search them for the line \`Where threads run (${marker})\`. Found: say nothing. ` +
    `Missing, or the line carries another value or an older version: ${tail}"${BLOCK_TEXT[l](marker)}" ` +
    `When the person asks to show the text: run \`${scriptCmd(pluginRoot, projectId)}\` and post its plain output verbatim as a reply in this thread.`;
}

/**
 * A readable name for the project in the Home pane: the wake envelope carries
 * only the id, so the folder of the first local thread stands in (its main
 * checkout, never a worktree folder). A name already recorded stays, also one
 * the user gave with `scripts/thread-location.js name`. Not in a cloud
 * container: its state does not persist.
 * @returns {string} the name recorded now, or ''
 */
function nameProject({ seen, projectId, remote, cwd, home }) {
  if (!projectId || remote || !cwd) return '';
  try {
    if (seen.projectName(projectId, home)) return '';
    const name = path.basename(require('../lib/devops-config').mainCheckoutRoot(cwd));
    return name && seen.setProjectName(projectId, name, { home, overwrite: false }) ? name : '';
  } catch { return ''; }
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
        const remote = process.env.CLAUDE_CODE_REMOTE === 'true';
        nameProject({ seen, projectId: id, remote, cwd: hook.cwd });
        const TL = require('../lib/thread-location');
        const value = TL.effective(id).value;
        const stamp = `${value}@v${TL.BLOCK_VERSION}`;
        const text = hint({ mode, projectId: id, hinted: seen.projectHinted(id), remote, lang, value });
        if (text) {
          // One combined note: the setup hint also covers the location block.
          seen.markProjectHinted(id);
          seen.markBlockChecked(id, stamp);
          parts.push(text);
        } else {
          const check = blockCheck({ mode, projectId: id, remote, checked: seen.blockChecked(id) === stamp, value, version: TL.BLOCK_VERSION, lang });
          if (check) { seen.markBlockChecked(id, stamp); parts.push(check); }
        }
      } catch { /* advisory */ }
      if (!parts.length) process.exit(0);
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: parts.join('\n\n') } }));
    } catch { /* advisory */ }
    process.exit(0);
  });
}

module.exports = { decide, hint, blockCheck, nameProject, LINE, FLAG, HINT_TEXT, BLOCK_TEXT, BLOCK_REMOVE_TEXT };
