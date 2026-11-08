# Ship — Session title (Pre-Step C)

Referenced by `/do-ship` Pre-Step C. The two hook paths (typed `/do-ship`,
Skill-tool load) and the sentinel rule stay in SKILL.md; this is the fallback
and the Desktop-only detail.

## Fallback

Only when the `[post.flow.title-mode]` block says the title is unknown:

1. `mcp__ccd_session_mgmt__get_session` with `session_id: "self"` → `title`.
2. If the title already starts with `⏳ ➜ 🚀 Shipping ┃ `: done.
3. Strip any leading devops prefix (`⏳ ➜ 🚀 Shipping ┃ `, `🟩 ➜ 🚀 Released Alpha ┃ `, `👉 ➜ 🧪 Test ┃ `,
   `👉 ➜ 📦 Ready ┃ `, `👉 ➜ 🚧 Blocked ┃ `, `⏳ `, … — the `SESSION_PREFIX` values and the legacy single-icon forms) left by an earlier card or
   ship in this session — never stack them.
4. `mcp__ccd_session_mgmt__set_session_title` with `session_id: "self"` and
   `title: "⏳ ➜ 🚀 Shipping ┃ {stripped title}"`.

The `⏳ ➜ 🤖 Solo ┃ ` is the fallback for "being worked on", never the override: no
hook or skill replaces a running `⏳ ➜ 🚀 Shipping ┃ ` with it (`{PLUGIN_ROOT}/deep-knowledge/session-title-scheme.md`).

## Desktop only

**Both tools exist only in the Desktop app.** Deferred is not unavailable: when they sit in the deferred-tools list, load
the set tool (fallback: both once with `ToolSearch` `select:mcp__ccd_session_mgmt__get_session,mcp__ccd_session_mgmt__set_session_title`), then call them
(`{PLUGIN_ROOT}/deep-knowledge/mcp-deferred-tools.md`). In a terminal session, an
unattended run, or when the call fails for any reason: skip silently — no
retry, no note to the user, no fallback. The rename is a courtesy, never a
gate. The completion card's `[SESSION TITLE]` block replaces the prefix with
the outcome (`🟩 ➜ 🚀 Released Alpha ┃ ` / `👉 ➜ 🚧 Blocked ┃ `, see Step 6; scheme: `{PLUGIN_ROOT}/deep-knowledge/session-title-scheme.md`); never restore a
remembered title by re-typing it.

## Width budget (all session titles)

The topic of every `<STATUS> ➜ <ICON> <Word> ┃ <topic>` title is clamped so that `<Word> ┃ <topic>` is at most **42 characters** (code points), the `…` included: topic max = 42 − `<Word>` length − 3. Cut at a word boundary when that loses at most 8 characters. The one implementation is `hooks/lib/title-budget.js` (`clampTopic`, `clampTitle`); every builder (`session-title.js`, `ask-title.js`, `mode-state.js`, the title-work first-prompt title) calls it, so a word switch re-clamps and a topic already ending in `…` is un-ellipsed first — `……` never stacks. When you set a title by hand, keep the topic short enough for the same rule.

Why 42: the Desktop sidebar (default ~440 px) shows only 43–46 characters of `<Word> | <topic>` after the status icons (measured from the user's screenshot, 2026-11-08). The sidebar width cannot be read from a hook, so a dynamic budget is not possible — the fixed rule is the agreed alternative. Re-measure if the app's sidebar font or default width changes.

## Batch topic fallback

A batch title whose topic is only a trigger word (`batch`, `/do-batch`, `do-batch on`, `devops batch`, `sammelmodus`, `collect mode`, `erstmal sammeln`) reads `Feedback zu <Projekt>` (de, default) / `Feedback on <project>` (en, session locale) instead of repeating "batch" (`hooks/lib/batch-topic.js`). `<Projekt>` is the main repo folder, not the worktree folder. The same fallback applies when the batch prefix is stripped after the merge fires.
