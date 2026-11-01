/**
 * @module skill-source
 * @description The auto-agents procedure, joined back into one text.
 *
 *   SKILL.md keeps the path every run needs; branches only some runs take
 *   (the permission audit, the full-ceremony plan, the burn conveyor) live in
 *   deep-knowledge/*.md, each named by one pointer line where it used to stand:
 *
 *     **Before executing this step, Read `{PLUGIN_ROOT}/skills/auto-agents/deep-knowledge/<file>.md` completely** — <what it holds>.
 *
 *   readSkill() replaces each pointer with that file's body (below its title
 *   and intro paragraph), so the text tests assert against the procedure as
 *   one document. A pointer to a missing file throws instead of silently
 *   dropping part of a step.
 */

const fs = require('fs');
const path = require('path');

const SKILL = path.join(__dirname, 'SKILL.md');
const DK = path.join(__dirname, 'deep-knowledge');
// The path names the skill folder in full: a bare `deep-knowledge/x.md` was
// resolved against the plugin root (where agent-orchestration.md lives) and
// missed — measured in the ceremony-plan eval.
const POINTER = /^\*\*Before executing this step, Read `\{PLUGIN_ROOT\}\/skills\/auto-agents\/deep-knowledge\/([a-z0-9-]+\.md)` completely\*\* — .+\.$/;

/** A deep-knowledge file without its `# title` and intro paragraph. */
function bodyOf(file) {
  const full = path.join(DK, file);
  if (!fs.existsSync(full)) throw new Error(`SKILL.md points at missing deep-knowledge/${file}`);
  return fs.readFileSync(full, 'utf8').split('\n\n').slice(2).join('\n\n').trimEnd();
}

/** Every pointer in SKILL.md, in order: { line, file }. */
function skillPointers() {
  const out = [];
  fs.readFileSync(SKILL, 'utf8').split('\n').forEach((text, i) => {
    const m = POINTER.exec(text);
    if (m) out.push({ line: i + 1, file: m[1] });
  });
  return out;
}

/** SKILL.md with every pointer replaced by the file it names. */
function readSkill() {
  return fs.readFileSync(SKILL, 'utf8').split('\n')
    .map((line) => {
      const m = POINTER.exec(line);
      return m ? bodyOf(m[1]) : line;
    })
    .join('\n');
}

module.exports = { readSkill, skillPointers, bodyOf };
