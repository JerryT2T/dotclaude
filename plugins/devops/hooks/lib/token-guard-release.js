'use strict';
/**
 * @module token-guard-release
 * @description The one decision path between `pre.tokens.guard` (before a
 *   tool call) and the mod's tool-output redirect (#1106 part 6c, after it).
 *
 *   The guard blocks a costly call once; an identical retry means "the full
 *   output is needed" and is released. That release must also stop the
 *   redirect from cutting the output down to head + tail afterwards, or the
 *   retry would be for nothing. So the guard marks each release here, keyed
 *   exactly like its own confirmation flag, and the redirect writer asks
 *   `wasReleased` before it shortens anything.
 *
 *   CJS so the guard and `scripts/paste-redirect-write.js` share it.
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

/** A release counts for the call that follows it, not for later ones. */
const RELEASE_TTL_MS = 5 * 60 * 1000;

/**
 * The subset of a tool input that actually determines the token cost, in a
 * fixed key order. Everything else (`description`, `run_in_background`,
 * `timeout`) is noise that used to break the retry-to-proceed release.
 */
function costFields(toolName, toolInput) {
  const input = toolInput || {};
  switch (toolName) {
    case 'Read':
      return { file_path: input.file_path || '', limit: input.limit || 0, offset: input.offset || 0 };
    case 'Bash':
      return { command: input.command || '' };
    case 'Glob':
      return { pattern: input.pattern || '', path: input.path || '' };
    case 'Grep':
      return {
        pattern: input.pattern || '',
        path: input.path || '',
        glob: input.glob || '',
        type: input.type || '',
        output_mode: input.output_mode || '',
      };
    default:
      return { tool: toolName };
  }
}

/** The guard's confirmation key: tool, project, cost fields. */
function confirmKey(toolName, cwd, toolInput) {
  return `${toolName}:${cwd}:${JSON.stringify(costFields(toolName, toolInput))}`;
}

function releasedPath(key, dir = os.tmpdir()) {
  const hash = crypto.createHash('md5').update(key).digest('hex').slice(0, 12);
  return path.join(dir, `claude_released_${hash}.flag`);
}

/** Called by the guard when it lets a retried call through. Never throws. */
function markReleased(key, { now = Date.now(), dir } = {}) {
  try { fs.writeFileSync(releasedPath(key, dir), String(now)); } catch { /* best effort */ }
}

/**
 * Did the guard release this call within the TTL? Consumes the mark: one
 * release covers one output. Unreadable counts as released (the safe side:
 * the full output stays).
 */
function wasReleased(key, { now = Date.now(), dir } = {}) {
  const file = releasedPath(key, dir);
  if (!fs.existsSync(file)) return false;
  let fresh = true;
  try {
    const at = parseInt(fs.readFileSync(file, 'utf8'), 10);
    if (Number.isFinite(at)) fresh = now - at < RELEASE_TTL_MS;
  } catch { /* stays released */ }
  try { fs.unlinkSync(file); } catch { /* gone */ }
  return fresh;
}

module.exports = { RELEASE_TTL_MS, costFields, confirmKey, releasedPath, markReleased, wasReleased };
