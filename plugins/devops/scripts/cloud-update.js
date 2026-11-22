#!/usr/bin/env node
/**
 * @script cloud-update
 * @version 0.1.0
 * @plugin devops
 * @description The bookkeeping side of the automatic claude.ai cloud-copy update
 *   (hooks/lib/cloud-update.js). A session that holds the update claim runs the
 *   claude.ai steps with its browser tool, then reports how it ended:
 *
 *     done    <version>   the sync was requested (Check for updates clicked)
 *     manual  <version>   a click is left for the person (login, captcha, blocked step)
 *     release <version>   this session cannot run it (thread, no browser tool): free the claim
 *     status              the recorded attempts, as JSON
 *
 *   Nothing here touches the network or claude.ai.
 */

'use strict';

const cu = require('../hooks/lib/cloud-update');

function main(argv) {
  const [cmd, version] = argv;
  if (cmd === 'status') {
    console.log(JSON.stringify(cu.readState(require('os').homedir()), null, 2));
    return 0;
  }
  if (['done', 'manual', 'release'].includes(cmd) && /^\d+\.\d+\.\d+$/.test(String(version || ''))) {
    const ok = cu.markUpdate({ version, state: cmd });
    console.log(ok ? `recorded: ${cmd} ${version}` : 'could not record (another session holds the lock — repeat in a moment)');
    return ok ? 0 : 1;
  }
  console.error('usage: cloud-update.js done|manual|release <X.Y.Z> | status');
  return 2;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main };
