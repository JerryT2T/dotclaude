#!/usr/bin/env bash
# A small repo with the schema and one reader of the column, so the red-team
# agent has something real to check the rename plan against.
set -e
git init -q . 2>/dev/null || true
git checkout -q -b eval/work 2>/dev/null || git switch -q -c eval/work
mkdir -p db src
cat > db/schema.sql <<'SQL'
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
SQL
cat > src/users.js <<'JS'
// Reads the column the plan renames.
function findByEmail(db, email) {
  return db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
}
module.exports = { findByEmail };
JS
# The owner's machine may route read-only review agents to the API credit
# (apiCredit.enabled): that runs the review as a script, not as a subagent, and
# the SubagentStart line this case is about never fires. Switch it off here.
mkdir -p .claude
printf '{ "apiCredit": { "enabled": false } }\n' > .claude/devops-config.json
