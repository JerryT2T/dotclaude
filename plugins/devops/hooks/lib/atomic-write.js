/**
 * @module atomic-write
 * @version 0.1.0
 * @description Write a file by temp-file + rename, so a concurrent reader (another
 *   hook lane, another session, Claude Code itself) never sees a truncated file.
 *   Used for files this plugin shares with others: ~/.claude/settings.json,
 *   installed_plugins.json, the statusline launcher.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {string} file
 * @param {string|Buffer} data
 * @throws {Error} the write or rename failed (the temp file is removed)
 */
function writeFileAtomic(file, data) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`);
  try {
    fs.writeFileSync(tmp, data);
    let err;
    // Windows: rename onto a file another process has open can fail with EPERM/EBUSY for a moment.
    for (let i = 0; i < 5; i++) {
      try { fs.renameSync(tmp, file); return; } catch (e) {
        err = e;
        if (e.code !== 'EPERM' && e.code !== 'EBUSY' && e.code !== 'EACCES') break;
        const until = Date.now() + 20 * (i + 1);
        while (Date.now() < until) { /* short sync back-off */ }
      }
    }
    throw err;
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    throw e;
  }
}

module.exports = { writeFileAtomic };
