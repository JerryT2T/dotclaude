#!/usr/bin/env bash
set -e
git init -q . 2>/dev/null || true
git config user.email eval@example.com
git config user.name eval
printf '{"name":"shop","private":true}\n' > package.json
printf '# shop\n' > README.md
git add -A && git commit -qm init
git checkout -q -b eval/work 2>/dev/null || git switch -q -c eval/work
git remote add origin https://github.com/example-org/shop.git
# Stub gh (see skills/auto-issue/bug-with-marker): logs every call to
# gh-calls.log, answers `gh issue create` with a fixed URL, fails the rest.
mkdir -p bin
cat > bin/gh <<'STUB'
#!/usr/bin/env bash
root="$(cd "$(dirname "$0")/.." && pwd)"
printf '%s\n' "$*" >> "$root/gh-calls.log"
prev=""
for a in "$@"; do
  if [ "$prev" = issue ] && [ "$a" = create ]; then
    echo "https://github.com/JerryT2T/dotclaude/issues/4243"
    exit 0
  fi
  prev="$a"
done
echo "gh (eval sandbox): only 'gh issue create' is available here" >&2
exit 1
STUB
chmod +x bin/gh
echo bin/ >> .git/info/exclude
echo gh-calls.log >> .git/info/exclude
