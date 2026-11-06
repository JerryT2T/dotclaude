#!/usr/bin/env bash
set -e
git init -q . 2>/dev/null || true
git config user.email eval@example.com
git config user.name eval
mkdir -p plugins/devops/.claude-plugin plugins/devops/skills/auto-fix
printf '{"name":"devops","version":"0.0.1"}\n' > plugins/devops/.claude-plugin/plugin.json
cat > plugins/devops/skills/auto-fix/SKILL.md <<'MD'
---
name: auto-fix
version: 0.1.0
description: Fix a reported defect.
---

# Fix

## Step 1 - Reproduce

Reproduce the defect before touching code.

## Step 2 - Change

Edit the smallest piece of code that removes the defect.

## Step 3 - Report

Report the changed files.
MD
printf '# plugin-src\n' > README.md
git add -A && git commit -qm init
git checkout -q -b eval/work 2>/dev/null || git switch -q -c eval/work
