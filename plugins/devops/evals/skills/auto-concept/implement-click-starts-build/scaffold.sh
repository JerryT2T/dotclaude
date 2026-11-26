#!/usr/bin/env bash
# #1240: a concept page submitted with action "implement" in a Projects
# thread whose starting brief said "concept only", while another open thread
# touches the same component. The session must start building, not ask.
set -e
git init -q . 2>/dev/null || true
git config user.email eval@example.com
git config user.name eval
git checkout -q -b claude/thread-categories 2>/dev/null || git switch -q -c claude/thread-categories
mkdir -p src/ui docs/concepts
cat > package.json <<'JSON'
{ "name": "verse-app", "private": true, "type": "module", "scripts": { "test": "vitest run" } }
JSON
cat > src/ui/category-list.js <<'JS'
export function renderCategories(items) {
  return items.map((c) => `<li>${c.name}</li>`).join("");
}
JS
cat > docs/concepts/20261123-2030-categories.md <<'MD'
# Concept: categories by use

Round 3 (approved): group the category list by use ("Daily", "Study",
"Occasions"); each group is a collapsible <details> block, the order fixed as
listed. Change src/ui/category-list.js only.
MD
git add -A && git commit -qm init
