# Browser Tool Strategy

Which browser tool a skill, agent or hook uses, and the guards around it. The
single source of truth for browser tool choice — skills reference it, they do
not repeat it. When to test at all and on which surface: [test-autonomy.md](test-autonomy.md).

## Decision table — one tool per use case

| Use case | Tool | Why |
|---|---|---|
| The project's own app: localhost / dev server, `file://` pages, tests, screenshots, viewport and dark-mode checks | **Built-in pane** (`mcp__Claude_Browser__*`) | Desktop default, no extension needed, sign-ins persist per repo, `resize_window` presets (mobile/tablet/desktop) and `colorScheme` built in |
| External sites the user is **logged in** to (GitHub, Supabase, claude.ai, dashboards), file uploads, flows the user watches or takes over | **Claude-in-Chrome in Edge** (`mcp__claude-in-chrome__*`) | The user's real Edge profile: cookies, logins, extensions |
| Public pages, docs, staging or a deployed app without a login | Built-in pane | Same as localhost; no user context needed |
| Neither of the two answers | Playwright (`mcp__plugin_playwright_playwright__*`) | Last structured fallback |
| Native desktop app, game, canvas — no DOM | Computer-use | The pixel floor ([test-autonomy.md](test-autonomy.md)) |

Older tool names stay valid: `mcp__Claude_Preview__preview_*` (the pane's former
server) and `mcp__Claude_in_Chrome__*` (older extension installs).

## Probe order — follows the use case

Probe the tool the table names first; on failure swap to the other one, then
Playwright. Fall through silently — no "extension not connected" message.

| Use case | 1st probe | 2nd probe | 3rd probe |
|---|---|---|---|
| localhost / public | pane `preview_list` (or `tabs_context`) | Chrome `tabs_context_mcp` | Playwright `browser_snapshot` |
| logged-in external | Chrome `tabs_context_mcp` | pane `tabs_context` | Playwright `browser_snapshot` |

Set `$BROWSER_TOOL` to `pane`, `chrome-mcp` or `playwright` (the value `preview`
from older skills means `pane`). None responds → show the block below and abort
the browser part of the task. **Never** fall back to computer-use for a page
that has a DOM: browsers are read-only tier in computer-use.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  BROWSER TOOL NICHT VERFÜGBAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Geprüft: ✗ Browser-Pane · ✗ Claude-in-Chrome (Edge) · ✗ Playwright
Fix:
  1. Desktop-App: Browser-Pane öffnen (Ansicht → Browser)
  2. Edge: Extension-Icon → "Connected"? Sonst edge://extensions → Neu laden
  3. Claude-Code-Session neu starten (Reconnect)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Tool mapping

| Action | pane (`mcp__Claude_Browser__`) | chrome-mcp | playwright |
|---|---|---|---|
| Open URL / dev server | `preview_start` (`url` or launch.json `name`), `navigate` | `tabs_create_mcp` + `navigate` | `browser_navigate` |
| Screenshot | `computer` screenshot | `computer` screenshot | `browser_take_screenshot` |
| Click / type | `computer` click / type, `form_input` | `computer`, `form_input` | `browser_click`, `browser_type` |
| Eval JS | `javascript_tool` | `javascript_tool` | `browser_evaluate` |
| Read text / DOM | `get_page_text` / `read_page`, `find` | `get_page_text` / `read_page`, `find` | `browser_snapshot` |
| Console / network | `read_console_messages` / `read_network_requests` | same names | `browser_console_messages` / `browser_network_requests` |
| Viewport / dark mode | `resize_window` (`preset`, `colorScheme`) | `resize_window` | `browser_resize` |
| Several steps at once | `browser_batch` | `browser_batch` | — |

**Structured data → Eval JS, never Read page.** "Read page" strips scripts, CSS and
JSON blocks and fails on large self-contained pages ("page body too large"). JSON
blocks, DOM state, form values and attributes are read with `javascript_tool` /
`browser_evaluate`.

## Edge rules — whenever Claude-in-Chrome is the tool

1. **Edge only.** The extension runs in Microsoft Edge (Chromium; the "Chrome" in
   its name is the extension type). Never launch or drive Chrome, Firefox or any
   other browser.
2. **The user's own Edge profile.** No sandboxed, headless, InPrivate or second
   profile window, and no Playwright browser for a user-facing page: the logins
   are the point of this tool.
3. **A separate test window.** Edge running → open one with
   `start "" msedge --new-window "{url}"` (same profile, so logins work), then
   reuse its tabs. Edge not running → `start "" msedge "{url}"`. Never `--app=`.
4. **One tab group per session.** Before creating a tab call `tabs_context_mcp`
   and reuse a tab of this session (navigate it) or join its group. After a
   reconnect probe again before creating anything; a duplicate group is ignored,
   never closed (it may hold user content). Parallel agents: one agent manages
   tabs, or re-probe after a 1–2 s jitter.
5. **`tabId` is a number** — coerce a parsed one (`Number($TAB_ID)`) before any
   call; a string fails MCP validation.

## Guards — every tool

- **Computer-use for a browser only on explicit request** ("Desktop übernehmen"
  in `/do-run autonomous`, or the user asks for desktop control). Never in
  background, concept monitoring or autonomous testing, never as a silent
  fallback. A packaged desktop app with a DOM is attached via
  `--remote-debugging-port`, not driven by pixels; a TUI is read through Bash.
- **Same rules in every mode** — foreground, background, autonomous, headless.
  Background never means "another browser" or "computer-use instead".
- **Tab alive check** before reusing a stored tab: list tabs (`tabs_context` /
  `tabs_context_mcp`). Tab missing → the user closed it: stop and say so. The
  list call itself fails → the tool disconnected: reconnect.
- **Split capability.** A connected tool can still refuse JS eval (Chrome MCP:
  "Cannot access a chrome-extension:// URL of different extension"). Skills that
  need eval (concept monitoring, heartbeat injection) run one test eval right
  after the probe and swap tools when it fails (auto-concept `monitoring.md`
  § Pre-Monitoring Setup).
- **Mid-session failure:** retry the same call once → re-run the probe order →
  continue with the working tool (fresh tab id) → nothing works: the block
  above. Never stop monitoring silently; a closed concept tab ends it with
  "Die Concept-Seite wurde geschlossen. Monitoring beendet."
- **Silent Edge restart** (Chrome only, once, before the error block): no
  `msedge` process → `start msedge --restore-last-session`, wait 5 s, re-probe.
