# Ship Reference — dotclaude (plugin-source repo)

This is the **plugin-source** repo. A ship here changes the devops plugin itself,
so after the merge the locally-installed devops in *this* Claude Code instance must
be brought in sync with what was just shipped — otherwise the running instance keeps
the old version and the next session lands in a stale state ("devops nicht verfügbar").

> **Channel caveat (ring model).** "In sync with what was just shipped" only holds
> when the local install's channel pin (`~/.claude/plugins/.channels.json`, default
> `stable`) actually receives the shipped version. A plain `/do-ship` publishes to
> **alpha** only, so on the default stable pin the local install correctly STAYS on the
> previous stable version until `/do-ship promote` promotes it — the Step 8 finalizer is
> then a cache-repair no-op, not a failure. Do not "fix" the detached-HEAD marketplace
> clone by forcing it onto `main`; the pin resets it by design. See the memory
> `project_ring_model_local_stays_stable` for the full symptom/diagnosis note.

## Why, paths, path resolution

Why this repo (and no other) self-updates after a ship, the double-restart and
cache/registry-drift failure modes, the paths involved, and why Step 8 resolves the
hook fresh instead of trusting `${CLAUDE_PLUGIN_ROOT}`:
`deep-knowledge/self-update-rationale.md`. The finalizer delegates to the same hook as
`/auto-update` (`hooks/session-start/ss.plugin.update.js`); no update logic lives here.

## deliver / verify

deliver: git+gh
<!-- No remote-deploy surface. The "delivery" of this repo is the plugin update above. -->

---


# Ship Extension — dotclaude (plugin-source repo)

Adds one project-specific step to `/do-ship`: a **post-ship self-update** of the
installed devops plugin. This repo ships the plugin that runs the ship, so the local
install must be reconciled with what was just merged. Full rationale (double-restart
problem, observed cache/registry drift): `deep-knowledge/self-update-rationale.md`.

This extension is **additive** — every plugin-default step still runs unchanged.

## Pre-step — Learned-eval gate (before the release, before `ship_run`)

Run once, from the repo root, before the release is started:

```
node plugins/devops/evals/ship-gate.js [--base origin/main]
```

It maps the changed `plugins/devops/skills/<skill>/**` to the `learned`-tagged
eval cases of those skills and runs them through `ab-run.js` (plan login, one
run each; real model runs). **Exit 1 stops the ship**: relay its
`ship-gate: FAIL <case> ...` lines verbatim and fix the skill or the case;
never skip the gate silently. Exit 0 (no case applies, all pass, or only
undecided `null` grades) continues. `--dry-run` prints the selection. Details:
`plugins/devops/evals/README.md` "Ship gate".

## Step 6.5 — Announce the local channel outcome IN the completion card

Do this **before** calling `render_completion_card` in Step 6, using pure file reads
(no MCP). **Channel-aware (ring model):** a plain `/do-ship` publishes vNew to the
**alpha** channel only. The local install follows its channel pin at
`~/.claude/plugins/.channels.json` (`{ "dotclaude": "<channel>" }`; absent → `stable`).
Whether the local install moves to vNew depends on that pin — it does NOT
automatically sync to every ship.

1. Read the channel pin: `~/.claude/plugins/.channels.json` → `dotclaude` (absent/unknown → `stable`).
2. Read installed version: `~/.claude/plugins/installed_plugins.json` → `plugins["devops@dotclaude"][0].version`.
3. Add exactly one `userFinalTest` item, in the user's language:
   - **Pin is `alpha`** — the install tracks alpha, so the Step 8 finalizer moves it to vNew.
     The card is rendered before the finalizer runs, so the item names the sync
     that follows, never a finished one:
     > `{ action: "devops lokal (alpha) wird auf v<vNew> synchronisiert — danach Claude einmal neu starten, dann ist die neue Version aktiv.", afterDeployment: true }`

     When Step 8's verify loop gives up (the clone still reports vOld after three
     attempts), the next session's version line says so (Step 8).
   - **Pin is `alpha` AND a `backlog-runner` lockout is active** (Step 8 guard below —
     this ship is one of several in a `/do-run backlog` queue): the finalizer is deferred
     to the runner's own Step 5, so do not claim a sync yet:
     > `{ action: "devops lokal (alpha) wird nach dem letzten Backlog-Issue auf die geshippte Version synchronisiert — danach Claude einmal neu starten.", afterDeployment: true }`
   - **Pin is `alpha` AND `.claude/.ship-queue` exists** (an auto-cleanup PR queue):
     same deferral, the cleanup run syncs once after its last PR:
     > `{ action: "devops lokal (alpha) wird nach dem letzten PR der Queue auf die geshippte Version synchronisiert — danach Claude einmal neu starten.", afterDeployment: true }`
   - **Pin is `beta`/`stable`** (the default) — an alpha-only ship does NOT reach this
     install. Do **not** claim any local sync; point to promotion:
     > `{ action: "v<vNew> ist auf alpha veröffentlicht; dein <pin>-Install bleibt auf v<installed>. »promote <pin> <vNew>« an Claude promotet genau diese Version (alpha→<pin>), danach zieht der Install v<vNew> beim nächsten Start.", afterDeployment: true }`

**Never assert "lokal auf vNew synchronisiert" on a beta/stable pin.** The finalizer
(Step 8) correctly holds the install on its pinned channel tag, so an alpha-only ship
leaves it unchanged — a false "synced" claim sends the user hunting a non-existent
sync failure (observed 2026-07-19). This keeps the completion card the **last visible
output** (per plugin Step 6); do **not** print the notice as separate prose after the
card — the card carries it.

## Step 6.6 — The claude.ai account copy (Desktop Code tab + cloud sessions)

devops also lives as a claude.ai account plugin (Auto-Sync from `main`, mirrored by the
Desktop app; the only route into cloud sessions). Before the render, read the Desktop
mirror's version and add the one `userFinalTest` item that asks the user to confirm the
synced commit: `deep-knowledge/account-copy.md`. Same guards as Step 8.

## Step 8 — Self-update finalizer (a project hook, nothing for you to run)

**`.claude/hooks/post-ship-sync.js` runs this step**, wired in `.claude/settings.json` as
PostToolUse of `render_completion_card`: on a `ship-successful` or `released` card it starts
the sync detached, applies the guards below, and also mirrors the install over the Desktop
copy, so the next Desktop session starts on vNew. Do not run it yourself after a normal
ship. Only a queue orchestrator (backlog Step 5, auto-cleanup Step 10b), whose per-ship cards
were skipped by the guards, runs `node .claude/hooks/post-ship-sync.js --now` once from the
repo root, as § Action says. This hook and the file live outside `plugins/`: plugin
consumers never get them and follow their channel pin through `ss.plugin.update`.

> **Why that trigger.** The sync rebuilds the cache to a new `installPath` and writes
> `~/.claude/plugins/.mcp-stale.json`; once that sentinel exists, `pre.mcp.health`
> blocks every further `mcp__plugin_devops_*` call, so it must not start before the
> render. A refused render is a tool error and fires no PostToolUse. `show_widget`
> belongs to the Desktop app, not to this plugin, so the sentinel never blocks it.

> **Channel-aware — NOT a guaranteed move to vNew.** The finalizer runs
> `ss.plugin.update`, which is channel-pinned (ring model): it reconciles the local
> install to the **highest version visible to the pin** (`.channels.json`, default
> `stable`) via a detached channel-tag checkout — NOT to `main`/vNew. After a plain
> (alpha-only) ship on a stable/beta pin the version does NOT move and the finalizer
> only cache-repairs — that is EXPECTED, not a drift bug. Do NOT force the marketplace
> clone onto `main`/an alpha tag to "fix" it (the pin resets it every SessionStart by
> design). The install receives vNew only after `/do-ship promote` promotes it to the pin.

### Guards — skip the finalizer entirely when ANY of:

- **Not a final ship to main.** `intermediate: true` from Step 1 → skip. Intermediate
  merges don't change the published plugin version.
- **Keep-mode** (Step 5a chose keep / Step 5c ran). The user keeps working in this same
  session; marking MCP stale would break their next `ship_*` / card call mid-flow. Skip,
  and do **not** add the Step 6.5 card item either. The plugin syncs on their next real
  restart via `ss.plugin.update` as usual.
- **Ship did not succeed** (`ship_release.success` falsy / `ship-blocked` card). Nothing
  was merged → nothing to sync.
- **A `backlog-runner` lockout is active.** Run
  `node "$CLAUDE_PLUGIN_ROOT/scripts/autonomous-lockout.js" check` and read `owner`:
  `"backlog-runner"` means this ship is one of several that `/do-run backlog` composes
  from ONE session. The finalizer marks the MCP servers stale, and `pre.mcp.health`
  would then block the `ship_*` / card calls of every issue still in the queue — on
  2026-09-18 the deferral had to be done by hand (PRs #401/#402/#404). Skip here; the
  runner runs this finalizer exactly once at its Step 5, after its final card's render
  and before that card is delivered. Use the deferred Step 6.5 wording for the card item.
- **A ship-queue marker exists.** `{project}/.claude/.ship-queue` (written by
  the auto-cleanup skill's Step 10b — or any orchestrator that lands several PRs from one
  session, see the plugin `/do-ship` → *Composed ships*) means the same thing as the
  `backlog-runner` lockout above, without an AFK lockout: the user is present, the
  ships are interactive, but the finalizer would still strand every later `ship_*`
  call of the queue behind `.mcp-stale`. Skip here; the orchestrator runs this
  finalizer exactly once after its last ship and then deletes the marker. Use the
  deferred Step 6.5 wording for the card item (replace „Backlog-Issue" with „PR").
  A marker older than 6 h is stale (plugin `/do-ship` → *Composed ships*): delete it
  and run the finalizer normally.
- **devops not installed here** ("falls vorhanden"). If
  `~/.claude/plugins/marketplaces/dotclaude` does not exist, there is no install to sync.
  The hook no-ops on its own, so just running it is safe — no extra guard needed.

### Action

The hook does this on its own. An orchestrator's one finalizer run, and an explicit
re-run after a miss, is `node .claude/hooks/post-ship-sync.js --now` from the repo root.
Result of the last run: `~/.claude/plugins/.post-ship-sync.log`. What it does:
it runs the canonical updater (same hook `/auto-update` delegates to — single source of
truth, no duplicated logic), checks the result against the newest remote tag the pin sees,
retries up to three times, then mirrors to the Desktop copy.

The sync uses the **marketplace clone's** hook, never `${CLAUDE_PLUGIN_ROOT}`: that
variable pins the version dir the session started with, which a rebuild may have deleted
(`MODULE_NOT_FOUND` right after the 0.107.0 ship), and only the clone is sure to hold the
newest hook. `--force` is mandatory (it bypasses the SessionStart cooldown). Why it
verifies and retries, and the already-synced race signature:
`deep-knowledge/step8-finalizer.md`.

The hook runs after the card is rendered, so a miss cannot go on that card. It lands in
the log above, and the next session's `ss.plugin.update` says `⚠ devops: lokal X hinter
<channel>` because the install still trails its channel. When a `--now` run ends on a miss, tell
the user in ONE line, never a claimed sync:
> `{ line: "devops lokal (alpha) steht noch auf v<vOld> — der Sync hat das neue Alpha-Tag nicht erreicht. Claude »devops update« sagen, dann Claude einmal neu starten." }`

The session is now in a deliberately MCP-stale state; that is expected and resolves on the
user's single restart.

### After-restart contract

On the user's next session start, `ss.plugin.update` finds the marketplace clone and cache
already on the shipped version → nothing moves → it **clears** the stale sentinel → MCP
tools work immediately, new version active. One restart, no blocked-tool window.

## Add after Step 5b

### Plugin audit on a decade boundary or monthly (background, never a gate)

On the final ship of a version that crosses a decade boundary (`0.289.x → 0.290.0`)
or when the last audit is 30+ days old,
start the plugin audit in the background after Step 5b. Trigger check, command, card
hint, and why the parent owns it under `--delegated`:
`deep-knowledge/plugin-audit-trigger.md` (sibling of this file).
