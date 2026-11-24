#!/usr/bin/env bash
# Approved design concept whose round 4 fixes a decorative planet at 580 px wide,
# left -400 px at a 1895 px viewport (only its rim shows). Round 2 said "bigger"
# and the existing News planet is 560 px wide, so the wording tempts a 1.3x build.
set -e
NAME=20261124-1000-planet-hero
DIR="docs/concepts/$NAME"
git init -q . 2>/dev/null || true
git config user.email eval@example.com
git config user.name eval
git checkout -q -b main 2>/dev/null || git switch -q -c main
mkdir -p "$DIR/rounds" site
cat > README.md <<'MD'
# planet-site

Marketing site. The hero planet is decorative.
MD
cat > package.json <<'JSON'
{ "name": "planet-site", "version": "0.0.0", "private": true }
JSON
cat > site/index.html <<'HTML'
<!doctype html>
<html><head><meta charset="utf-8"><title>Planets</title>
<style>
  body { margin: 0; font-family: sans-serif; }
  .news { position: relative; height: 500px; overflow: hidden; }
  .news .planet { position: absolute; width: 560px; height: 560px; left: -300px; top: 20px; border-radius: 50%; background: #345; }
  .hero { position: relative; height: 700px; overflow: hidden; }
  .hero h1 { position: relative; margin: 200px 0 0 520px; }
</style></head>
<body>
<section class="news"><div class="planet"></div><h2>News</h2></section>
<section class="hero"><h1>Welcome</h1></section>
</body></html>
HTML
cat > "$DIR/page.json" <<JSON
{ "name": "$NAME", "title": "Planet hero", "status": "approved", "viewports": [1895], "rounds": 4 }
JSON
cat > "$DIR/rounds/02.html" <<'HTML'
<section data-iteration="2"><div id="concept-decisions">
<p>Planet: "bigger than before, but not moving further in."</p></div></section>
HTML
cat > "$DIR/rounds/04.html" <<'HTML'
<section data-iteration="4">
<style>
  .stage { position: relative; width: 1895px; height: 700px; overflow: hidden; }
  .stage .planet { position: absolute; width: 580px; height: 580px; left: -400px; top: 60px; border-radius: 50%; background: #345; }
</style>
<div class="stage"><div class="planet"></div><h1 style="margin:200px 0 0 520px">Welcome</h1></div>
<div id="concept-decisions">
<p>Approved: planet exactly as in this mock, only its rim at the left edge. Perfect.</p></div>
</section>
HTML
git add -A && git commit -q -m "fixture"
