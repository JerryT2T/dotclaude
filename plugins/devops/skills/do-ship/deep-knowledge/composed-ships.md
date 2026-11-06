# Ship — Composed ships and run flags

Referenced by `/do-ship` § Composed ships. The `--cwd`, `--keep` and
`--queued` rows stay in SKILL.md; this is the queue marker and the remaining
run flags.

## Queue marker

| Signal | Effect on this run |
|---|---|
| `.claude/.ship-queue` marker in the target repo root (`{ owner, since }`) | Written by the orchestrator before its first ship, deleted after its own finalizer. Project ship extensions MUST skip any post-ship step that mutates this install (plugin self-sync, cache rebuild, MCP restart) while it exists — the orchestrator runs that step exactly once at the end. Not a lockout: `AskUserQuestion` gates stay interactive unless Pre-Step A says otherwise. **Stale rule:** a marker whose `since` is older than 6 h belongs to a queue that died; a plain `/do-ship` (no `--queued`) deletes it and proceeds as if absent, so one crashed cleanup run never defers finalizers forever. |

## Standing mandate

"Ship everything together" covers every linked session until each has landed, not one merge event.

- Work that arrives after a combined ship joins a follow-up ship without asking. Only the "run a follow-up ship?" question drops; safety gates (ambiguous merge, security finding, major bump) still stop the ship.
- Each follow-up ship re-arms `.claude/.ship-queue`, so an active mandate does not go stale. It ends when no linked session is left to land.
- A session started for a combined ship gets the no-ship rule in its brief. A later message cannot stop it: a message queues until that session's turn ends, and it may merge first.

## Run flags

| Signal | Effect on this run |
|---|---|
| `--delegated` | This run is the fresh-context subagent of a delegated ship (Pre-Step 0). Follow `modes/delegated.md` → *Subagent*: gates return a decision instead of asking, the card comes back as JSON. |
| `--card-data` | Passed by the /auto-concept finalize (part C). With `--delegated`: stop before the render and return the card data, the caller renders after its close-out (`modes/delegated.md` § Card data instead of a card). Inline: parsed and ignored — the finalize already orders close-out before the render. |
| `--resume` | Continue an interrupted ship from its checkpoint (Pre-Step R). Sent by `prompt.ship.detect`'s `[ship-resume]` block when the user continues ("weiter", "continue", a ship prompt) and a ship stopped half-way. |
| `--inline` (old: `--no-compact`) | Keep this one ship in the main context even when the context is large (Pre-Step 0). Parsed and dropped — it changes nothing else. |
