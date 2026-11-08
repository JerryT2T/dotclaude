# Completion Card — Desktop Widget vs. Terminal

How the card reaches the user: the Desktop `show_widget` card body, its buttons, links and tooltips, and the terminal markdown fallback. Split out of `completion-card-design.md` (§ 4 there points here); section numbers below (§ 2.x, § 3, § 5) refer to that file.

- **Desktop:** the whole card is ONE `mcp__visualize__show_widget` call (the
  "card body widget"), made as the **last action of the turn, with no card
  markdown at all** — the tool result carries no markdown block, and no text
  may follow the widget. card-guard reads the card from that call instead
  (`deliveredCardText`: a card-body `show_widget` after the turn's last
  render stands in as `✨✨✨ {title} ✨✨✨`, the title taken from the
  widget's h3).
- **Ending on the widget (Desktop).** Since the widget ends the turn itself
  (next bullet), what follows applies only where the turn is held
  open (an orchestrator, the opt-out, a blocking Stop hook). A turn whose last model call follows
  a tool result without text gets ONE meta nudge from Claude Code —
  `[Your previous response had no visible output…]` — and a widget-only
  card turn always ended that way. The nudge fires once per turn; an empty
  reply (no text, no tool call) ends the turn with the card last. Every
  line written for it ("Die Card steht oben …") lands under the card, so
  the card contract says to reply with nothing (`NO_OUTPUT_NUDGE_REPLY`,
  shared by card-guard and card-widget). Once the card was shown after the
  last render, nothing that follows re-demands it: the Stop gate passes,
  and `post.flow.completion` answers the widget call with "end of turn"
  instead of its generic render reminder. Both used to ask for the card
  again, which drew the same card twice (observed 2026-09-24).
  Every hidden-markdown marker tried before showed as a stray literal line
  under the widget in the Desktop chat: an HTML comment (#443) and a
  `[//]: # (…)` link reference definition (#470). (Until 0.184.0 the
  markdown was the visible title line — `&nbsp;` · `---` ·
  `### **✨✨✨ {title} ✨✨✨**` · `---` — which read as a second, empty card
  header under the widget on every turn.) The visible ✨ line stays ONLY
  off this widget path: a variant without a widget body, or a widget call
  that fails (Claude then prints the visible `### **✨✨✨ {title} ✨✨✨**`
  line), keeps the ✨ headline as before. That title line is the error
  path only, never a shortcut (#451): every Desktop render also saves the
  widget_code to `<tmp>/dotclaude-devops-card-widget-<session>` and names
  it in the `[CARD WIDGET]` block, and `stop.flow.guard` blocks a card turn
  on which `show_widget` was never called, pointing at that file. The widget draws the
  title (h3) and both blocks, colours (green posts, red, yellow, lilac
  glyphs — see **Text colours** below), app-styled
  tooltips (Info 1500 ms, Label 500 ms for the budget bars), the budget bars, the quiet PR link and the buttons. Nothing is
  drawn twice (observed 2026-09-21: widget + full markdown showed the whole
  card twice). The widget wraps result lines instead of cutting them — the
  120-char ellipsis of § 2.2 is a terminal budget, and a line cut mid-sentence
  read as "the card only shows half". `cardSignature` (§ 5.5) falls back to
  the title for such a title-only card.
- **The widget ends the turn — nothing can follow it.** Of 208 Desktop card
  turns on 0.200–0.208 (2026-09-24/25), 152 had text under the card (a turn
  can count twice): 108 wrote right after the widget — mostly a recap, 29
  times only a zero-width space to dodge the nudge — 28 after a tool call
  that followed the card (do-ship's memory pass, the plugin-source repo's
  self-sync finalizer, a status check), 19 answered the nudge, 6 followed a
  Stop-gate block. No instruction fixed that (render result, output style,
  and from 0.208.1 the PostToolUse reminder #534 all said "nothing after the
  card"). So `post.flow.completion` ends the turn on the card-body widget
  call itself (`hooks/lib/card-turn-end.js`): it runs the plugin's Stop hooks
  in hooks.json order with the Stop payload Claude Code would send, and when
  none blocks it answers `{"continue": false}` — Claude Code stops the loop
  before another model call, so no text, no nudge and no post-card tool call
  can follow (verified end to end on 2.1.281: widget, then `result` with
  `stop_reason: tool_use`, no further message; the Stop gate's flags were
  reset by the in-hook run). The in-hook run is needed because after a
  PostToolUse stop Claude Code runs no command Stop hook, only the session's
  own callbacks (`turn_end_reactions`). A Stop hook that blocks (V&V gate,
  card gate, web hand-off) keeps the turn going: its reason reaches Claude as
  `[card-turn-end] …`, the fix happens, and the next widget tries again with
  `stop_hook_active: true`. The turn is never ended while an orchestrator
  still works after its cards — an active autonomous lockout (do-run AFK and
  backlog: shutdown and finalizers follow the card) or a fresh
  `.claude/.ship-queue` (several ships and cards in one turn);
  `DOTCLAUDE_CARD_HARD_STOP=0` turns it off. The stop notice
  (`[devops] Card shown — turn ended.`) is not part of the SDK stream the
  Desktop renders. So do-ship's memory pass runs before the card (Step 5e),
  and a step that cannot run before `render_completion_card` runs between the
  render and the `show_widget` call. Rejected alternatives: a
  `MessageDisplay` hook only swaps the final message while the SDK streams the
  raw text live (the Desktop consumes partial messages) — at best a flicker;
  an MCP result with `_meta: { "claude/endTurn": true }` and
  `CLAUDE_CODE_TERMINAL_MCP_TOOLS` both end or quiet a turn, but only for
  tools that return that meta or that the Desktop lists — `show_widget` is
  the Desktop app's tool.
- **Desktop surfaces and sizes** (feedback 2026-09-21: two bordered boxes did
  not read as one card; both titles and the detail text were a step too
  large; the grey surface tokens read "too colourless" on the dark page):
  ONE outer surface on a faint blue wash (`rgba(55,138,221,.06)`, 6 % of the
  accent blue), 12px radius, **no border**, wraps everything. Block 1 has no box of its own inside it. Block 2
  is a box at the bottom on a quiet accent wash (`--bg-accent-muted`, 10 % of
  the accent fill, fallback `rgba(55,138,221,.10)`), 10px radius, **no accent
  border**. Exactly four text sizes: `h3` 16px/500 for the title and the
  decision heading; 14px for result lines, evidence posts and points; 13px for
  the context line, the buttons (30px tall), the budget label and the pipeline
  line; 11px for the bar watermark and the context-health note. Two bordered
  boxes, an h2, or a fifth size anywhere in the widget are a regression. The
  budget sweep stays clipped to the elapsed fill (a glint over time that has
  not passed made no sense), narrow and soft so it reads as a glint, not as
  a second bar. Every `›` line (result lines, context,
  points) draws the glyph in lilac at weight 500, inset 6px from the heading
  edge and hugging its text (8px column, 4px gap, 4px vertical margin), with the text in
  `--text-secondary`: the glyph leads, the line does
  not shout (feedback 2026-09-21: glyph too faint, text too loud). The widget
  never numbers the points — `1.` stays a terminal-markdown form. Block 1
  order on every variant: title → result lines → evidence → pipeline →
  budget; the pipeline line and the budget row carry their own vertical
  padding (4px) so they do not stick to the evidence row. A run-contract line
  right under the pipeline line drops its top padding, so the two related dim
  lines sit 10px apart like the rest of the block, not 14px; the renderer
  decides that, because a `<style>` rule cannot beat the line's inline
  padding. The decision box has 10px 12px inner padding. The white frame around the whole
  widget is the Desktop app's `show_widget` container — not part of the card
  and not controllable from inside.
- **Text colours** (polish 2026-09-26): the palette was tuned for the dark
  theme and measured 1.5–2.2:1 (status colours) and 3.3:1 (dim lines) on the
  light card surface, below WCAG AA. Every text colour now goes through the
  host's tokens, so each theme gets its own value. The status colours are the
  host's `--text-success` / `--text-danger` / `--text-warning` /
  `--text-tint-violet` softened toward `--text-secondary` (30 / 55 / 40 /
  60 %), fitted so the dark theme keeps its muted palette (`#8fae8f`,
  `#e0a0a0`, `#d9c58a`, `#aab4e6`): 7.2–7.9:1 light, 8.2–8.9:1 dark. The dim
  lines (pipeline line, all-✓ run-contract line, ladder labels, context-health
  note) are the watermark hue `#7d84a8` pulled 25 % toward `--text-primary`:
  5.0:1 light, 7.1:1 dark, still a step quieter than the body text. Measured
  on Claude Desktop 2.9939's own tokens (canvas `--surface-0`). Only the bar
  graphics keep literals (track, fill, marker, and the watermark inside the
  always-dark track); the unmixed role tokens were rejected because they turn
  the dark theme's green and amber loud.
- The `ready-red` heading names what is actually red: `N roten Tests` only
  when tests failed, else `N unerfüllten Anforderungen`, else `N teilweise
  erfüllten Anforderungen` (an unmet requirement is no red test).
- **Terminal / other clients:** the markdown body as in § 2 without buttons;
  code spans only for error texts, names in *italics*; budget as glyph bars.
- `test-minimal` never calls the widget.
- **Template + data (token cost).** The inline card HTML is 7–12k
  characters and passed through the model twice (tool result, then the
  `show_widget` input). The live path therefore sends a template of about
  0.9–1.8k characters: the sr-only `h2`, a `#dc-card` mount holding the
  title `h3` (card-guard reads the card title from it; it is also the first
  paint), the card data as JSON in `<script type="application/json"
  id="dc-card-data">` (`<` escaped), and a `<script src>` to
  `https://cdn.jsdelivr.net/gh/JerryT2T/dotclaude@alpha/v<version>/plugins/devops/mcp-server/lib/card-widget.client.js`.
  The version is the running plugin's (`.claude-plugin/plugin.json`), as its
  `alpha/v<version>` ring tag: every ship tags alpha and a promotion re-tags
  the same commit, so that tag exists for every shipped version (there are no
  bare `v*` tags). The tag is immutable, jsDelivr caches it for good, and the client
  always matches the data schema of the server that wrote the data (the
  widget CSP allows `cdn.jsdelivr.net`, the repo is public).
  `DOTCLAUDE_CARD_CLIENT_URL` (https only) points at another build, e.g. a
  branch while developing the client.
  `mcp-server/lib/card-widget.client.js` is the ONE renderer: plain browser
  JS (one IIFE) that draws the card and wires buttons and tooltips. The
  server evaluates the same file in a `vm` context for the full inline HTML,
  so both paths draw identical markup (`card-widget.client.test.js` mounts
  the template in jsdom and compares). Every visible string rides in the
  data; the client hard-codes none.
  **Fallback:** when the script cannot load (tag without the file, CDN down,
  CSP refusal) its `onerror` adds the result lines, the heading and the
  points as plain text under the title; the client calls the same handler
  when it meets an unknown data schema (`v`). The widget is never empty.
  **Cold tag:** jsDelivr answers the first request for a freshly pushed tag
  with 503 while it pulls the file from GitHub — the 0.284.6 ship card stayed
  a bare title that way (2026-10-21). So a failed load is retried once after
  2 s before the text fallback, and the completion server requests its own
  client URL in the background right after it connects
  (`card-widget.js#warmCardClient`), so the first card finds it cached.
  The offline renderer (`--render-card`, MCP server never connected) keeps
  the full inline HTML — no network dependency on that path.
- The old CTA-actions widget (buttons above the card) is replaced by the body
  widget. The `[CTA ACTIONS]` block becomes `[CARD WIDGET]` with the same
  Desktop-only / skip-silently semantics. Controls remain `span[role=button]`.
- **Delivery (Code-tab host rules, read from its bundle 2026-09-22):**
  1. `ui/message` never sends. When it is accepted, the host puts the prompt
     into the composer (`onPrefillComposer`) and the user presses Enter. A
     widget has no path to auto-submit.
  2. The host refuses (`isError`) unless its frame has live user activation
     (about 5 s after the click in the widget) and it saw no pointer or key
     event of its own in the last 5250 ms. A click soon after typing,
     clicking or dragging the scrollbar in the app window is refused.
  3. It also refuses while the composer is not empty (text, attachments, or
     an upload in progress).
  4. It refuses a prompt whose text starts with `/` — a leading space does
     not help (observed live 2026-09-23: ` /compact …` and `/devops:do-ship …`
     red, `ship --no-compact` and plain sentences green). A button can
     therefore never carry a slash command. Button prompts are plain text
     that reaches the skill by its trigger words: `ship` (prompt.ship.detect),
     `promote` / `ship stable` (prompt.ship.detect → do-ship with the channel), `Debug …` (auto-fix).
     Built-in commands like `/compact` have no such route — the card shows
     them as text. `card-widget.test.js` rejects any slash prompt.

  `sendPrompt()` drops the reply, so all of these failures were silent. That
  is the "works only sometimes" bug. The button script now posts
  `ui/message` itself and reads the reply. After a refusal or no reply
  (1 s), it posts again every 300 ms while the click's activation lasts
  (5 s), which gets past rule 2. It cannot double the prompt: once the
  composer is filled, rule 3 refuses the next post. The button then shows
  `Im Eingabefeld, Enter sendet`, or
  `Nicht übernommen, Eingabefeld leeren und erneut klicken`. There is no
  clipboard fallback. `card-widget.send.test.js` pins this behavior against
  a host simulator that applies these three rules.
- **Links (Code-tab host rules, read from its bundle 2026-09-24, Claude
  2.7032):** the widget script sends an `<a href>` as `ui/open-link`, and the
  host opens **only https**: a confirmation dialog, then the default browser
  (or the built-in one when "Open links in built-in browser" is on). An
  **http link is dropped without a trace**, localhost included, and the
  widget frame's sandbox has no `allow-popups`, so `window.open` and
  `target=_blank` get nowhere either. The app setting does not change that.
  So an https URL stays an anchor, and a loopback page (concept page, dev
  server: `localhost`, `*.localhost`, `127.x`, `[::1]`) becomes an **open
  button**. The URL stays visible and copyable. The click prefills
  `Im Standardbrowser öffnen: <url>` (en: `Open in default browser: <url>`)
  with the button rules above, and `prompt.flow.open-url` opens the page on
  Enter. It opens in the OS default browser (`rundll32
  url.dll,FileProtocolHandler` / `open` / `xdg-open`, never a shell) and
  blocks the prompt, so reopening never reaches Claude and spends no tokens.
  The block is a JSON verdict (`hooks/lib/block-prompt.js`), so the panel
  holds one short line — `✓ Seite im Browser geöffnet — kostet keine Tokens.`
  — not the hook path and a paragraph (#958). Only a prompt that is
  exactly the prefix plus one loopback URL is handled. The hook probes the
  URL first (1.5 s, any HTTP response counts as alive, self-signed loopback
  certs accepted): a dead page is never opened — the prompt passes through
  with context telling Claude to start the dev server, or, for the active
  concept page, to relaunch its bridge on the same port (the hook never
  relaunches it itself). If the browser cannot start, the prompt passes
  through and Claude opens the page itself. Any
  other http URL stays an anchor: dead on the Desktop app, but still a
  visible address.
