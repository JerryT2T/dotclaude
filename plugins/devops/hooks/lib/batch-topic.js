/**
 * @module batch-topic
 * @version 1.0.0
 * @description The topic of a batch session title. A session that only said
 *   "batch" / "/do-batch" / "sammelmodus" has no subject yet, so the title
 *   `👉 ➜ 📚 Batch ┃ batch` repeated its own word (2026-11-08). Such a topic
 *   becomes `Feedback zu <Projekt>` (de) / `Feedback on <project>` (en); the
 *   project is the main repo's folder — for a worktree the folder holding
 *   `.claude/worktrees`, not the worktree's own name.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/** A topic that is only the command or phrase which starts the batch mode. */
const TRIGGER_RE = new RegExp(
  '^(?:' +
    '/?(?:devops[:\\s-]+)?(?:do-)?batch(?:[\\s-]+(?:on|an|start|mode|modus))?' +
    '|sammelmodus|sammel-modus|collect[\\s-]mode|erstmal sammeln|erst mal sammeln|sammeln' +
  ')$',
  'i',
);

/** True when `topic` is just a batch trigger word / command (case-insensitive). */
function isTriggerTopic(topic) {
  const t = String(topic ?? '').trim().replace(/[\s.!?]+$/, '');
  return !!t && TRIGGER_RE.test(t);
}

/**
 * The main repository's folder name for `cwd` (a worktree resolves to the
 * folder that holds `.claude/worktrees`), or '' when unknown.
 */
function projectName(cwd) {
  if (!cwd || typeof cwd !== 'string') return '';
  const norm = cwd.replace(/\\/g, '/').replace(/\/+$/, '');
  // git's common dir is authoritative; the path shape is only the fallback when git cannot answer.
  try {
    if (fs.existsSync(cwd)) {
      const out = execFileSync('git', ['rev-parse', '--git-common-dir'], {
        cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000, windowsHide: true,
      }).trim();
      if (out) {
        const common = path.resolve(cwd, out);
        const root = path.basename(common) === '.git' ? path.dirname(common) : common;
        return path.basename(root);
      }
    }
  } catch { /* not a repo: fall through */ }
  const m = /^(.*?)\/\.claude\/worktrees(?:\/|$)/.exec(norm);
  if (m && m[1]) return path.posix.basename(m[1]);
  return path.posix.basename(norm);
}

/** `Feedback zu <Projekt>` / `Feedback on <project>`; `Feedback` alone when the project is unknown. */
function fallbackTopic(lang, cwd) {
  const name = projectName(cwd);
  const word = lang === 'en' ? 'Feedback on' : 'Feedback zu';
  return name ? `${word} ${name}` : 'Feedback';
}

/**
 * `topic` itself, or the feedback fallback when it is only a trigger word.
 *
 * @param {string} topic
 * @param {{ lang?: string, cwd?: string }} [ctx] lang defaults to 'de'
 */
function batchTopic(topic, { lang = 'de', cwd } = {}) {
  return isTriggerTopic(topic) ? fallbackTopic(lang, cwd) : topic;
}

module.exports = { isTriggerTopic, projectName, fallbackTopic, batchTopic };
