# Completion Card — Tool-Schema Field Rationale

Why the `render_completion_card` fields say what they say. Split out of `completion-card-design.md` (§ 9 there points here); section numbers below refer to that file.

The `render_completion_card` schema is sent with every session, so its field
texts carry only the call-time rules. The reasoning behind them lives here.

- **`answer`** (#757): text written before a further tool call can be rephrased
  by the Desktop app; inside the widget it survives. The summary stays a title
  (#642), never the answer.
- **`cwd`**: without it `getRepoUrl` falls back to the MCP server's own cwd
  (the plugin dir), so PR/commit/branch links are dead. It also lets the card
  read `.claude/concept-active.json` (open concept page URL) and
  `.claude/batch-mode.json` (armed /do-batch collection, BATCH CTA).
- **`state.mode`**: unknown keys are stripped, so omitting it made the
  file-only render path unreachable.
- **`pending`**: the card never asks the user to act on a result that does not
  exist yet; it names the first three items on a dim line above the CTA and
  renders a block per item. Workflows are counted as their own class.
- **`concept`**: heading per phase is `wartet auf deine Entscheidungen auf der
  Seite` / `in Iteration` / `in Implementierung`; real background work follows
  as its own sentence. While `waiting` the card shows the page's
  `http://localhost:{port}/…` link above the CTA (none while iterating).
- **`deployGate` / `state.deployPending`** (#243): a merged-but-undeployed ship
  must not read as done; `deployPending` flips the decision heading to
  `👉 ⚠️ Not deployed`.
- **`open`**: points naming another branch/worktree are dropped (that session's
  work; leftovers are ship_hygiene's job). A live session's unlanded work is no
  finding at all: never name a dropped point again in `answer`, a closing line or
  anywhere else on the card. Obvious next steps are dropped on
  test and ready cards unless they end in `?`. The promote nudge belongs in
  `delivery.promote.stableLag` (it replaces the old userFinalTest item).
- **`paused`** (#583): title and heading name the reason (`🔌 Restart`,
  `💻 Reboot`, `🔋 Limit reset`); the context line names the resuming action.
- **`verification`** (#612): the skip renders `⚠ unverified — skipped: <reason>`
  plus a decision point; the Stop gate accepts it.
- **`delivery.promote`**: `betaLag`/`stableLag` render as `−N · D d` after the
  channel version on the ladder; channels on the same version merge.
- **`nextStep`**: on `analysis` the Desktop primary button becomes
  `Empfehlung umsetzen` and sends exactly this text; without it the button
  says only `Umsetzen`. With `ship-successful` + `state.kept` the `Weiter`
  button sends it.
- **`readOnly`**: `true` on a read-only assignment. An `analysis` card then drops
  `Umsetzen` / `Empfehlung umsetzen` (nothing can be implemented in that
  session); the open-point `Nachbessern` button stays. Ignored on other variants.
