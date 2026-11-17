#!/usr/bin/env bash
# A small web app with four unrelated surfaces (gallery, holo dossier, login,
# admin upload), each in its own folder — the #1131 trigger. The bridge, the
# browser, crons and kills are denied in case.yaml, so the run can build the
# page but never serve or open it.
set -e
git init -q . 2>/dev/null || true
git config user.email eval@example.com
git config user.name eval
git checkout -q -b main 2>/dev/null || git switch -q -c main
cat > README.md <<'MD'
# ship-companion-web

A fan web app: a ship gallery, a holo dossier per ship, a login page and an
admin page for uploading game data. Plain HTML/CSS/JS, no framework.
MD
mkdir -p src/gallery src/dossier src/login src/admin
for s in gallery dossier login admin; do
  printf '<!doctype html><title>%s</title><main id="%s"></main>\n' "$s" "$s" > "src/$s/index.html"
  printf '/* %s styles */\n' "$s" > "src/$s/style.css"
done
git add -A && git commit -qm "chore: init"
git checkout -q -b eval/work 2>/dev/null || git switch -q -c eval/work
