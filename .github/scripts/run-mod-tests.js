#!/usr/bin/env node
'use strict';
/**
 * Engine tests of the devops mods (plugins/devops/hooks/mods/*.test.tsx):
 * `claude plugin test plugins/devops`. vitest never sees them (it picks
 * *.test.js only). Without a `claude` CLI on PATH (a CI runner, a machine
 * without Claude Code) it says so and exits 0: the plugin works without the
 * module, and these tests need the engine itself.
 *
 * Usage: node .github/scripts/run-mod-tests.js   (npm run test:mods)
 */

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const shell = process.platform === 'win32';

const probe = spawnSync('claude', ['--version'], { encoding: 'utf8', shell });
if (probe.status !== 0) {
  process.stdout.write('test:mods skipped: no `claude` CLI on PATH (the mod tests run on the engine: claude plugin test plugins/devops)\n');
  process.exit(0);
}
process.stdout.write(`test:mods on claude ${String(probe.stdout).trim()}\n`);
const run = spawnSync('claude', ['plugin', 'test', 'plugins/devops'], { cwd: root, stdio: 'inherit', shell });
process.exit(run.status === null ? 1 : run.status);
