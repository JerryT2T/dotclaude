# Built-in Browser Pane — Capabilities & Limits

Canonical reference for the Desktop **built-in browser pane**
(`mcp__Claude_Browser__*`; the former Claude Preview server
`mcp__Claude_Preview__preview_*` is still accepted). It is the default tool for
the project's own localhost app, `file://` pages and public pages. Tool choice,
probe order and the tool-mapping table live in
[browser-tool-strategy.md](browser-tool-strategy.md); autonomy rules in
[test-autonomy.md](test-autonomy.md). This file documents what the pane can and
cannot do, so skills/agents defer here instead of re-describing it.

---

## What the Pane Is

A browser view inside the Claude Desktop app. A dev server is started from
`.claude/launch.json` (a named config with `runtimeExecutable` + `port`) via
`preview_start` (`url` or launch.json `name`); any URL can be opened with
`navigate`. No browser extension is needed.

## Toolset → tier mapping

The tiers are defined in [test-autonomy.md](test-autonomy.md) § Surface Tier Order.

| Tier | Capability | Pane tool |
|------|-----------|-----------|
| 1 — Structured read | DOM + ARIA + text + console + network | `read_page`, `get_page_text`, `find`, `read_console_messages`, `read_network_requests` |
| 2 — Rendered read | rendered pixels, layout, colour, CSS | `computer` (screenshot, zoom), `javascript_tool` (`getComputedStyle` for exact CSS props) |
| 2 — Responsive | viewport + dark mode | `resize_window` (`preset` mobile/tablet/desktop, `colorScheme` light/dark) |
| 3 — Interaction | click / type / fill / eval | `computer` (click/type/key/scroll/hover), `form_input`, `javascript_tool` |
| — | tabs | `tabs_context`, `tabs_create`, `tabs_select`, `tabs_close` |
| — | lifecycle | `preview_start`, `preview_list`, `preview_logs`, `preview_stop` |
| — | batching | `browser_batch` (several steps in one call) |

`resize_window` ships **native** viewport presets, so for responsive testing it
is preferred over the `javascript_tool` resize hack (see
[responsive-testing.md](responsive-testing.md)).

## Key advantage — session persistence

The pane persists cookies + localStorage in an Electron partition keyed by the
**baseRepo path** (`%APPDATA%\Claude\Partitions\launch-preview-<md5(baseRepo)>`).
Consequences (empirically verified):

- A login done once in a repo's pane **persists across worktrees and chats** of
  that repo — no per-window Edge profile juggling, no re-login per chat. The account
  you log in as is normally the **local test user** (full app permissions, dev-only,
  never deployed to prod — see [test-strategy.md](test-strategy.md) § Local Test User).
- It survives `preview_stop` → `preview_start` (the partition is held by the Claude
  Desktop App main process).
- Scope is **per baseRepo**: a different repo has its own jar (one login per repo).

## Limits — what goes to another tool

- **Not the user's Edge profile.** The pane is not logged in to third parties
  (GitHub, Supabase, claude.ai, dashboards) → Claude-in-Chrome in Edge.
- **File upload to third parties and user-watched flows** → Claude-in-Chrome in Edge.
- **No native desktop apps** — packaged binaries, OS shells, tray, installers.

## N/A list — never route these to the pane

- **claude.ai usage scraper** (`refresh-usage-headless.js`, `~/.claude/edge-usage-profile`) —
  external origin + auth. Stays on dedicated Edge CDP. See [edge-profiles.md](edge-profiles.md).
- **Logged-in external / deployed-URL checks** (e.g. post-merge production health
  behind a login) — Claude-in-Chrome in Edge.
- **`concept` interactive pages** — served over an http bridge with a cron
  heartbeat in the user's real Edge; the pane cannot host the bridge.
- **Native / cross-app flows** — `desktop-testing.md`, `windows-platform.md`.

---

## Cross-References

| Topic | File |
|-------|------|
| Tool choice + probe order | [browser-tool-strategy.md](browser-tool-strategy.md) |
| Autonomy + tier order | [test-autonomy.md](test-autonomy.md) |
| Responsive viewports | [responsive-testing.md](responsive-testing.md) |
| Edge profiles + usage scraper | [edge-profiles.md](edge-profiles.md) |
