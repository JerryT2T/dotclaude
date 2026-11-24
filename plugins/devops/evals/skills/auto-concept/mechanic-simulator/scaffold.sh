#!/usr/bin/env bash
# A small game-helper repo whose one doc describes a mechanic: pips on EM, IR,
# cooling and ammo components drive heat, damage and shield regeneration. The
# bridge, the browser, crons and kills are denied in case.yaml, so the run can
# build the page but never serve or open it.
set -e
git init -q . 2>/dev/null || true
git config user.email eval@example.com
git config user.name eval
git checkout -q -b main 2>/dev/null || git switch -q -c main
cat > README.md <<'MD'
# ship-energy-notes

Notes and a calculator for a ship energy model in a space game.
MD
mkdir -p docs
cat > docs/energy-model.md <<'MD'
# Energy model

A ship has a power plant with 12 pips. The pips are spread over four
components: EM (weapons capacitor), IR (sensors), cooling and ammo.

- Each component takes 0 to 4 pips.
- Heat per second = 10 * (1 + EM pips) - 3 * cooling pips. Above 60 the ship overheats.
- Damage per second = 2 * heat + 5 * ammo pips.
- Shield regeneration per second = 4 * IR pips + 2 * cooling pips.
- Spent pips never exceed the 12 of the power plant.

Open questions from the designer: is cooling worth more than a third of the pips,
does ammo scale linearly, does IR matter for regeneration at all.
MD
git add -A && git commit -qm "chore: init"
git checkout -q -b eval/work 2>/dev/null || git switch -q -c eval/work
