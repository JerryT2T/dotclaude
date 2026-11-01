# Edge Profiles

Configuration and usage rules for the two Microsoft Edge profiles used by this plugin.

---

> **Edge-only notice**
>
> Wherever the Claude-in-Chrome extension is the browser tool, this plugin uses
> Microsoft Edge exclusively (localhost and public pages go to the built-in pane,
> see [browser-tool-strategy.md](browser-tool-strategy.md)).
> The "Chrome-MCP" extension is a Chromium extension that runs **inside Edge** —
> never in Google Chrome. Plugin consumers do **NOT** need Google Chrome installed.
> When instructions say "Chrome-MCP", they always mean the extension loaded into
> the user's Edge browser.

---

## Profile Comparison

| Aspect | Main Edge (Chrome-MCP) | Scraper Profile (refresh-usage) |
|--------|------------------------|----------------------------------|
| Profile path | User's normal Edge profile (`Default`) | `~/.claude/edge-usage-profile` |
| Used by | Logged-in external sites, uploads, user-watched flows (Chrome-MCP extension) | `refresh-usage-headless.js` only |
| Cookies / logins | User's actual cookies, persistent across sessions | Isolated; one-time login required per machine |
| Tab interaction | DOM and CDP via Chrome-MCP extension | CDP via WebSocket on a dedicated port |
| Window placement | **Always a separate window** via `--new-window` flag (own Alt-Tab entry; shares taskbar icon with main Edge due to profile grouping) | Headless — no visible window |
| When triggered | Browser task that needs the user's logins | `get_usage` / the completion card (`--no-login`), or a manual usage refresh (`deep-knowledge/usage.md`) |
| Computer-use visibility | Visible in screenshots (read-only tier) | Not visible; headless CDP only |

---

## Why Two Profiles?

The scraper profile keeps automated usage-refresh traffic isolated from the
user's normal browsing session. The Chrome-MCP extension in the main profile
must not open automated tabs that clutter the user's workspace or risk
interfering with an active login flow.

Logged-in dashboard navigation uses the main profile because those tasks
require the user's persisted cookies (project sessions, GitHub login, SSO,
etc.). The scraper profile handles only the Claude-usage page, which needs its
own isolated session to avoid token conflicts.

**Pane vs Edge.** The built-in browser pane is the default for the project's own
localhost app and public pages; Edge / Chrome-MCP is used for logged-in external
sites, uploads and user-watched flows (see
[browser-tool-strategy.md](browser-tool-strategy.md)). The pane has no access to
the user's Edge logins, so the usage scraper (`refresh-usage-headless.js`,
`~/.claude/edge-usage-profile`) stays on dedicated Edge CDP and must never be
routed to the pane.

---

## Computer-Use Interaction with Main Edge

When computer-use fires (Tier 3, Must-Ask only), it drives screenshots of the
user's normal Edge window. Computer-use operates at the **read** tier for
browsers — it can see Edge in screenshots but cannot send clicks or keystrokes
to it. For click-level interaction in the browser, use Chrome-MCP tools instead.

---

## Cross-References

| Topic | File |
|-------|------|
| Browser tool waterfall and tier rules | [browser-tool-strategy.md](browser-tool-strategy.md) |
| Usage data (automatic + manual path) | [usage.md](usage.md) |
