#!/usr/bin/env bash
# Three parked notes, the collect mode already off (as after an expiry), no
# remote. `/do-batch go` reaches the skill's Step 4 without the hook's merge
# context, so the skill itself must run the fire procedure.
set -e
git init -q . 2>/dev/null || true
git config user.email eval@example.com
git config user.name eval
git checkout -q -b main 2>/dev/null || git switch -q -c main
mkdir -p src .claude
printf '// Settings page.\nexport const buttons = [{ id: "save", label: "Save" }];\n' > src/settings.js
printf '// Page header.\nexport const header = { title: "Notes", bold: false };\n' > src/header.js
printf '.claude/\n' > .gitignore
git add -A && git commit -qm "chore: init"
git checkout -q -b eval/work 2>/dev/null || git switch -q -c eval/work
cat > .claude/batch.md <<'MD'
# do-batch notes

Collected prompts, newest last. Edit freely — the merge reads this file.

<!-- 2026-11-01T09:00:00.000Z -->
Rename the "Save" button label in src/settings.js to "Apply".

<!-- 2026-11-01T09:05:00.000Z -->
Add a "Reset" button next to it in src/settings.js that restores the defaults.

<!-- 2026-11-01T09:10:00.000Z -->
Make the header title in src/header.js bold.
MD
