#!/usr/bin/env bash
# A three-domain project (db, server, web) and a feature that touches all of
# them: the full-ceremony tier.
set -e
git init -q . 2>/dev/null || true
git config user.email eval@example.com
git config user.name eval
git checkout -q -b main 2>/dev/null || git switch -q -c main
mkdir -p db/migrations server web
printf -- '-- 001: notes\nCREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);\n' > db/migrations/001_notes.sql
printf 'const http = require("http");\nconst routes = { "/notes": () => [] };\nmodule.exports = http.createServer((req, res) => res.end(JSON.stringify((routes[req.url] || (() => null))())));\n' > server/index.js
printf '<!doctype html>\n<title>Notes</title>\n<main id="notes"></main>\n' > web/index.html
printf '{ "name": "notes-app", "version": "0.1.0", "private": true }\n' > package.json
# Enough surface per domain that the feature spans well over ~5 files
# (observed: a 4-file repo was classified Inline).
mkdir -p server/routes web/js
printf 'const fs = require("fs");\nconst path = require("path");\nconst dir = path.join(__dirname, "migrations");\nmodule.exports = () => fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();\n' > db/migrate.js
printf 'const store = new Map();\nmodule.exports = { get: (k) => store.get(k), set: (k, v) => store.set(k, v), all: () => [...store.values()] };\n' > server/db.js
printf 'const db = require("../db");\nmodule.exports = { list: () => db.all(), add: (n) => db.set(n.id, n) };\n' > server/routes/notes.js
printf 'export async function api(path, body) {\n  const res = await fetch(path, { method: body ? "POST" : "GET", body: body && JSON.stringify(body) });\n  return res.json();\n}\n' > web/js/api.js
printf 'import { api } from "./api.js";\napi("/notes").then((n) => { document.getElementById("notes").textContent = n.length; });\n' > web/js/app.js
printf 'main { font-family: sans-serif; padding: 16px; }\n' > web/style.css
git add -A && git commit -qm "chore: init"
git checkout -q -b eval/work 2>/dev/null || git switch -q -c eval/work
