# The claude.ai account copy of devops

Referenced by `reference.md` Step 6.6.

devops lives in two installs on the author's machine, and a ship has to reach both:

| Install | Where | Updated by | Used by |
|---|---|---|---|
| Claude Code plugin | `~/.claude/plugins/…`, channel-pinned | Step 8 finalizer (`ss.plugin.update`) | CLI / terminal sessions |
| claude.ai account plugin | marketplace `dotclaude` in claude.ai → Anpassungen → Plugins; mirrored by the Desktop app to `%LOCALAPPDATA%/Claude-Data/*/rpm/*/*/plugin_*/` | claude.ai **Auto-Sync** from the default branch `main` on push — no tags, no channels | the Desktop Code tab (it prefers this copy) and cloud sessions |

The account copy is the only route by which devops reaches cloud sessions, so it stays.
It tracks `main`, i.e. every ship lands there regardless of the channel pin. Two failure
modes were observed (2026-11-01): the account copy sat on 0.326.0 for six days until a
manual „Nach Updates suchen“, and its sync **dropped elements that fail claude.ai's
validation** (agent names under 3 characters) while still reporting „Synchronisiert“.
The validation side is guarded by `plugins/devops/agents/agent-names.test.js`; the sync
side needs a check after the merge.

Before the render, read the Desktop mirror's version (pure file read, skip silently when
no mirror exists):

```bash
for p in "$LOCALAPPDATA"/Claude-Data/*/rpm/*/*/plugin_*/.claude-plugin/plugin.json; do
  grep -q '"name": *"devops"' "$p" 2>/dev/null && sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$p" | head -1
done
```

Add one `userFinalTest` item, in the user's language:

> `{ action: "claude.ai-Konto-Plugin (Desktop + Cloud): unter Anpassungen → Plugins → Marketplaces verwalten muss „Synchronisierter Commit“ <merge-sha> zeigen, ohne Warnungen — sonst „…“ → „Nach Updates suchen“. Danach die Desktop-App neu starten (Desktop-Kopie aktuell v<mirror>).", afterDeployment: true }`

Skip the item under the same guards as Step 8 (intermediate merge, keep-mode, failed ship).
