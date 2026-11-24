#!/usr/bin/env bash
set -e
git init -q . 2>/dev/null || true
git config user.email eval@example.com
git config user.name eval
mkdir -p src
printf 'console.log("hello");\n' > src/main.js
printf '{"name":"scratch-tool","private":true}\n' > package.json
git add -A && git commit -qm "scratch"
