#!/usr/bin/env bash
# Replay of a REAL concept round (docs/concepts/20261030-1850-analyse-redesign,
# round 6): rounds 1-5 baked, round 6 live and just submitted. The submission
# is the user's real round-6 feedback, which the session of the time answered
# without ever measuring the hover state. The payload lands next to the page as
# the file the bridge would have handed over; the bridge, browser, crons and
# kills are denied in prompt.md.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
NAME=20261030-1850-analyse-redesign
DIR="docs/concepts/$NAME"
git init -q . 2>/dev/null || true
git config user.email eval@example.com
git config user.name eval
git checkout -q -b main 2>/dev/null || git switch -q -c main
cat > README.md <<'MD'
# dotclaude

A Claude Code plugin. This checkout holds the concept pages the owner
iterates on with Claude: `docs/concepts/<slug>/` (page.json + rounds/NN.html).
MD
cat > package.json <<'JSON'
{ "name": "dotclaude-replay", "version": "0.0.0", "private": true }
JSON
mkdir -p docs/concepts
cp -r "$HERE/fixture/$NAME" "$DIR"
node "$HERE/../../../../scripts/concept-build.js" build "$DIR" >/dev/null
cp "$HERE/submission.json" "docs/concepts/$NAME-submission-06.json"
mkdir -p .claude
cat > .claude/concept-active.json <<JSON
{ "concept": "$DIR.html", "source": "$DIR", "round": 6, "bridge": "down" }
JSON
git add -A && git commit -qm "chore: init with concept round 6"
git checkout -q -b eval/work 2>/dev/null || git switch -q -c eval/work
