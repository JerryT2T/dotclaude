#!/usr/bin/env node
/**
 * @hook ss.permissions.ensure
 * @version 0.2.0
 * @event SessionStart
 * @plugin devops
 * @description Ensure required plugin permissions exist so devops skills that
 *   write ephemeral review artifacts don't trigger permission prompts.
 *
 *   Idempotent: only adds rules that are missing; removes only its own
 *   retired rules (RETIRED_RULES), never a rule of the user's.
 *   Scope: user-global settings at ~/.claude/settings.json — the rules apply
 *   to all projects for this user. Also ensures the target directory exists
 *   so skills can Write without first running mkdir.
 */

const { readFileSync, writeFileSync, mkdirSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { homedir } = require("node:os");

const HOME = homedir();
const SETTINGS_PATH = join(HOME, ".claude", "settings.json");
const CONCEPTS_DIR = join(HOME, ".claude", "devops-concepts");

// Edit(path) rules cover every file-editing tool, Write included. A
// Write(path) rule is not matched by file permission checks and makes Claude
// Code warn on every start, so it is retired and removed where an older
// version added it (0.2.0).
const REQUIRED_RULES = [
  "Edit(~/.claude/devops-concepts/**)",
];
const RETIRED_RULES = [
  "Write(~/.claude/devops-concepts/**)",
];

try {
  mkdirSync(CONCEPTS_DIR, { recursive: true });
} catch {
  // Non-fatal — skills will create the dir if needed.
}

if (!existsSync(SETTINGS_PATH)) {
  // No user settings yet — don't create one just for this. Skills will
  // still prompt once; the user can approve and it sticks.
  process.exit(0);
}

let settings;
try {
  settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
} catch {
  process.exit(0);
}

settings.permissions ??= {};
settings.permissions.allow ??= [];

const before = settings.permissions.allow.length;
settings.permissions.allow = settings.permissions.allow.filter((r) => !RETIRED_RULES.includes(r));
const removed = before - settings.permissions.allow.length;
const existing = new Set(settings.permissions.allow);
const toAdd = REQUIRED_RULES.filter((r) => !existing.has(r));

if (toAdd.length === 0 && removed === 0) process.exit(0);

settings.permissions.allow.push(...toAdd);

try {
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
  console.error(
    `[dotclaude] Permission rules for devops report artifacts: +${toAdd.length} / -${removed}.`,
  );
} catch (err) {
  console.error(`[dotclaude] Could not update ${SETTINGS_PATH}: ${err.message}`);
}
