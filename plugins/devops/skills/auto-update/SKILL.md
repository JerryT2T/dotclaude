---
name: auto-update
version: 0.6.0
description: >-
  Manually update the devops plugin to the latest GitHub version and report
  the changelog. Explicit user request only. Triggers on: "update plugin",
  "plugin updaten", "devops update", "self update", "Cloud updaten".
layer: 2
invokes: []
user-invocable: false
triggers:
  en: ["update plugin", "self update", "devops update"]
  de: ["plugin updaten", "neue version", "Cloud updaten"]
allowed-tools: Bash(git *), Bash(node *), Read, Glob
---

# Plugin Update

Manually trigger a plugin update with user-facing reporting. The update logic
lives in `ss.plugin.update.js` (SessionStart hook) — the single source of
truth; this skill captures the state before, runs the hook, and reports.

## Constants

```
PLUGIN_ROOT = {PLUGIN_ROOT} (literal path from the session context; $CLAUDE_PLUGIN_ROOT is empty in the Bash tool)
MARKETPLACE_DIR = ~/.claude/plugins/marketplaces/dotclaude
PLUGIN_SUBDIR = plugins/devops
HOOK_SCRIPT = ${PLUGIN_ROOT}/hooks/session-start/ss.plugin.update.js
```

## "Cloud updaten" / "update cloud"

**The person asked: first action is to start the `auto-guide` skill** (#1233), goal "sync the dotclaude
marketplace on claude.ai", start URL `https://claude.ai/customize`. Never try the
built-in browser or Claude in Chrome on claude.ai yourself first, and never send
the clicks as chat text. Where the session runs decides how:

- **On the person's computer** (also a local thread): start `auto-guide` here. Claude
  in Chrome cannot open Customize, so it runs with a companion panel
  (`{PLUGIN_ROOT}/skills/auto-guide/deep-knowledge/recovery.md` § Companion panel).
- **In the cloud** (`CLAUDE_CODE_REMOTE=true`): `auto-guide` needs the person's Edge.
  In a project thread start a session on their computer (`start_remote_control`
  when offered, else ask the coordinator for a "Work locally" thread) with the
  prompt "Cloud updaten", and say in one line that the guide opens on the computer.
  Without such a route: one line in the person's language, "Say the same in a
  session on your computer, the guide opens there."

The steps the guide walks: Customize → Plugins → Manage marketplaces → dotclaude
"…" → Check for updates. The account copy, the one cloud sessions and cloud
threads run, syncs only there; the person keeps it, it is the only way devops
reaches cloud sessions. Then stop; skip the steps below.

**Automatic path (default).** `ss.project.setup` / `ss.catalog.remote` start the
update by themselves when it is needed: switch devops-config `cloud.autoUpdate`
on (default; global), a Claude Project thread ran on this machine
(`~/.claude/devops-thread-seen.json`, written from the thread flag), and the
copy trails the install. It is the one case where a session tries the steps itself
(Customize may refuse; then the guide is offered). The session that wins the claim
(`hooks/lib/cloud-update.js`: one updater at a time, once per version, retried
after 3 h unfinished / 24 h manual / 48 h done) gets an `[ss.cloud.update]`
block and clicks the steps above itself with its browser tool for logged-in
sites, inside a turn that runs anyway — not as a turn of its own and not in a
thread. It never automates a login: at a login, captcha or blocked step (a refused
navigation to Customize is one, never retried another way) it runs
`node "{PLUGIN_ROOT}/scripts/cloud-update.js" manual <version>` and offers the
guide: reply "Cloud updaten". Without a thread marker the lag is only mentioned,
not started.

## Step 0a — Which copy runs

`PLUGIN_ROOT` under `…/rpm/<org>/<user>/plugin_<id>` is the Desktop app's
claude.ai account copy. The hook below mirrors a newer Claude Code install over
it, effective from the next session; the claude.ai sync stays out of reach. Run:

```bash
CLAUDE_PLUGIN_ROOT="{PLUGIN_ROOT}" node "{PLUGIN_ROOT}/hooks/session-start/ss.catalog.remote.js" --force
```

The variable is required: without it, `plugin-guard` silently ends the hook on a
machine whose settings do not list the plugin. Show its stdout. No stdout means no lag against GitHub `main`, or GitHub was
unreachable. Limits: `claude-desktop-app-setup.md` § Account copy of a plugin.

- **No `MARKETPLACE_DIR`:** the account copy is the only install. Report its
  version and stop here.
- **`MARKETPLACE_DIR` exists:** continue, and end the report with
  `This session runs the account copy v{version}; the Desktop app gets the update
  below from the next session.` Drop the MCP lines from the report: this session
  runs no files from the cache.

## Step 0 — Capture current state + channel

1. Current version from `<MARKETPLACE_DIR>/<PLUGIN_SUBDIR>/.claude-plugin/plugin.json`
   and SHA from `git -C MARKETPLACE_DIR rev-parse --short HEAD`.
2. Channel pin from `~/.claude/plugins/.channels.json` (key = marketplace
   name, missing/invalid → `stable`). One channel per MARKETPLACE — a single
   clone cannot serve two plugins on different channels.
3. **`--channel <alpha|beta|stable>` flag:** re-pin by writing the sidecar
   (`{"dotclaude": "beta"}` merged into the existing JSON), then continue with
   the update so the new pin takes effect immediately.
4. Drift: latest version visible to the pin vs. latest alpha
   (`git -C MARKETPLACE_DIR ls-remote --tags origin`, numeric compare on
   `alpha/vX.Y.Z` / `beta/vX.Y.Z` / `stable/vX.Y.Z` / bare `vX.Y.Z`).
5. Report: `Currently installed: v{version} ({sha}) — Channel: {channel},
   latest visible: v{N}` and, when alpha is ahead:
   `(alpha has v{M} available)`.

## Step 1 — Run update hook

```bash
node HOOK_SCRIPT --force
```

`--force` is required: at SessionStart the hook is throttled by a 6 h cooldown
(#324) and defers cache repairs to a detached child; `--force` skips both so
the result is complete when this step returns.

The hook does the channel-aware checkout of every marketplace clone, the cache
rebuild, the `installed_plugins.json` update, a silent verification, and the
Quiet output style refresh. Show its stdout.

## Step 2 — Changelog

Read the NEW version and SHA, then `git -C MARKETPLACE_DIR log --oneline
{old_sha}..HEAD`. No changes → report "Already up to date" and stop.

## Step 3 — Verify & Report

1. **Version alignment** — these three must match, else report the mismatch:
   `<MARKETPLACE_DIR>/<PLUGIN_SUBDIR>/.claude-plugin/plugin.json`; the cache's
   `.claude-plugin/plugin.json` (`installed_plugins.json` → `installPath`);
   `installed_plugins.json` → `devops@dotclaude` → `version`.
2. **Cache completeness** — under `installPath`: `.claude-plugin/plugin.json`,
   `.mcp.json`, non-empty `skills/` and `hooks/`.
3. **Skill count** — `ls -d <dir>/skills/*/ | wc -l` for marketplace and cache
   must match.
4. **Quiet style** — from the hook output: `**Quiet output style**: synced …`
   → `synced`; a stderr `differs from every shipped Quiet style` note →
   `customized — left as is`; otherwise `current` when
   `~/.claude/output-styles/quiet.md` exists, else `not installed`.

Report:

```
Plugin updated: v{old_version} → v{new_version}
Commits: {count} new commits
{changelog}

Verified: ✓ version aligned, ✓ cache complete, ✓ {skill_count} skills
Quiet style: {synced | current | customized — left as is | not installed}
Restart the session for hooks and MCP tools to take effect.
Skills are available immediately.

⚠ MCP tools (/do-ship, /auto-issue, completion card) will be
blocked by pre.mcp.health until restart — the running MCP processes
point at the now-deleted old installPath.
```

The MCP warning applies only when the version changed: the hook then wipes the
old cache dir and writes `.mcp-stale.json`, which `pre.mcp.health` enforces. A
cache repair at the same version overwrites in place and does not block MCP.

## Known Issues

- **Desktop App does not auto-rebuild the cache** (anthropics/claude-code#14061)
  and may skip a plugin whose `installPath` no longer exists — the hook
  rebuilds it; Step 3 catches the rest.
- **Plugin key naming**: marketplace and plugin name must differ
  (`devops@dotclaude`, not `devops@devops`), or the plugin is hidden from the
  Customize UI.
