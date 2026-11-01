# do-batch Fire — the merge procedure (Step 4)

The body of `SKILL.md` Step 4, read on demand: only a fire route needs it
(`/do-batch go`, or a marker prompt without the hook's merge context), so
activation, status and off do not pay for it. Execution detail per sub-step
stays in `merge.md`. Step numbers refer to `SKILL.md`.

Reached either by `/do-batch go` or by a marker-prefixed prompt. Both fire the
SAME hook merge: the collect hook syncs main, matches late images to their notes,
injects the full note set and arms the hand-off gate. Only when that context
is absent (no `[do-batch] Der Nutzer hat N Notiz(en)` block in the turn — hook
disabled, or the prompt carried an attachment) do the steps below run by hand.
On the `go` route the Step 1 marker
pre-check runs first — a `markerFallback` is repaired before the merge, so the
next collection window starts with a marker that actually fires.

**Firing ends collection.** The hook deactivates the mode in the same run that
injects the notes — the answers and corrections that follow must not be
collected. Treat the mode as OFF for the rest of this turn and all following
ones.

**Notes belong to the session that collected them (#841).** `batch-mode.json` records
the collecting `sessionId`. The marker in a DIFFERENT session passes through untouched: the
hook archives the orphaned notes (never deletes), names the archive path once and merges
nothing. The same session keeps its marker after the mode expired. `/do-batch go` adopts
another session's notes on purpose. A mode file without a `sessionId` (older versions) counts
as owned by everyone.

**4.0 Bring main into the branch BEFORE reading a single note.** The notes may
be hours old; a plan checked against a stale base rebuilds what main already
has or collides with it at ship time.

On the marker and `go` paths the hook already ran `scripts/git-sync.js` and
injected the result as "SCHRITT 0" — read it first and resolve any `⚠` / `✗`
line before Step 4.1. Without an injected merge context, run
`node "{PLUGIN_ROOT}/scripts/git-sync.js" --explain` yourself, synchronously,
before anything else. **`– skipped:` is not "up to date"** — fix the named
cause and re-run before reading the notes. Reading the output, the skip causes
and the merge chain: `deep-knowledge/merge.md` § Sync main.

**4.1 Read every note.** `.claude/batch.md`, verbatim. Notes are the user's own
words — never paraphrase them away before analysing. When the injected context
says the notes were too large to inline, read the file **completely** first; the
index it carries is a checksum, not a substitute.

**A note's `[Anhang]` / `[Anhang-Datei]` lines belong to that note and to no
other.** Where an `[Anhang-Datei]` path still exists, open it before judging the
note. A late-matched line ending in "per Zeitstempel zugeordnet, N s Abstand —
prüfen …" is a guess: check the image fits the note before relying on it (how
the hook matches: `deep-knowledge/merge.md` § Late image matching). Where a note
refers to an image and neither path nor description exists, say so in its
coverage line instead of guessing. Where only the `[Anhang]` description
survives, that description IS the evidence — do not silently drop the note for
lacking the image.

**4.2 Write the coverage list before planning.** Exactly one line per note,
`#1` … `#N`, each with a disposition:

| Disposition | Meaning |
|---|---|
| übernommen | goes into the plan as written |
| zusammengeführt mit #x | same surface as another note |
| Konflikt mit #x | contradicts another note — Step 4.4 |
| nicht machbar (Grund) | fails the feasibility check — named, not skipped |
| Frage | answered first, then merged |

Count the lines against the note count in the injected context before you go on.
A note without a line is a lost requirement. If the user enriched the execute prompt
with extra text, it becomes `#N+1` and gets its own line — and if it was a
question, answer it before the plan.

**4.3 Feasibility-check against the real code BEFORE planning.** The notes
were written blind; some will be impossible, and later notes may depend on
those. Check the substantive ones against the codebase.

**4.4 Build the bundle plan — full detail, parallel, never a gate.** One
coherent piece of work, not a list of n tasks executed one after another.
Where notes describe the same surface, they merge. Build this plan on
**both** routes (4.6): a concept page needs it as much as an implementation
run. It is written silently as the execution basis, and the user is never
asked to approve it (see 4.6).

The plan must carry (each item in full, with sizing and examples:
`deep-knowledge/merge.md` § Bundle plan):

1. **Every concrete detail of every note** — including each `[Anhang-Datei]`
   path, which reaches the implementing agent's prompt verbatim.
2. **One bundle per area, not per note.** Two bundles never own the same file.
3. **Named interfaces and order.**
4. **Verification per bundle.**
5. **Findings per bundle — hand the 4.3 analysis on.**

**4.5 Surface conflicts individually — never resolve them silently.**

> "#2 wollte den Header rot, #6 blau — ich nehme blau (später), sag Bescheid falls nicht."
> "#3 setzt eine Filter-API voraus, die es nicht gibt. #5 und #9 hängen daran und fallen mit."

An impossible item is **named**, never quietly routed around.

**4.6 Present the plan and pick the hand-off.** do-batch plans; it never
implements. Show the coverage list, the merged plan and every named conflict
or infeasible item in this turn, then hand the whole thing to exactly ONE
skill (4.9). No separate "passt der Plan?" question: the receiving skill's
first interaction — do-run's questions, the concept page — is the approval
point.

**Decision rule — does the plan still need a decision, or is it ready?**

| The merged plan … | Hand to |
|---|---|
| has **no open decision**: every coverage line is übernommen, zusammengeführt, nicht machbar (named, and nothing that depends on it needs a new direction) or a Frage already answered; at most **one** conflict, and that one resolved in the plan with a named default the user can veto ("#2 rot, #6 blau — ich nehme blau") | **do-run** with `--from=do-batch` |
| has **at least one open decision**: two or more conflicts, or one without a defensible default · a note that asks for analysis, a comparison or a concept rather than a change · a visual/design choice the notes leave open · an infeasible note whose dependents need a new direction · two or more approach forks in the plan itself | **auto-concept** with `--from=do-batch` |

When unsure, route to auto-concept: an unneeded decision page costs one
click-through, a silently decided conflict costs the user's requirement. A
plan that is mostly ready with one open fork still goes to auto-concept — the
concept's implement click runs the whole plan through `auto-agents`, so the
ready parts are not delayed by a second hand-off, and do-run is never
started afterwards for the same plan.

"Implementation" stays deliberately broad: code, concepting, UI concepting,
or only a first step of what the notes ask for — the receiving skill decides
the scope with the user.

**4.7 Archive, do not delete.** Before the hand-off, call `archiveNotes(cwd)`
— it renames `batch.md` to `batch-<timestamp>.md`, so the user's own words
stay recoverable. The archived path travels with the hand-off (4.9). Image copies stay
where they are (`deep-knowledge/merge.md` § Archive).

**4.8 Retire the mode — never ask whether to stay in it.** Collection is already
off (the hook deactivated it when the merge fired; on the `/do-batch go` path
do it yourself — `deactivate(cwd)` is idempotent). Stop the watchdog
(`batch-watchdog.js stop .`) and strip a leading `👉 ➜ 📚 Batch ┃ ` from the session
title, leaving any other title alone — commands and steps:
`deep-knowledge/merge.md` § Retire.

Say in one clause that follow-up prompts run normally again and `/do-batch on`
re-arms collection.

**4.9 Hand off — the last action of the turn.** Invoke the Skill chosen in
4.6 with `--from=do-batch` followed by the hand-off body:

**Hook-enforced, not just written down.** When the merge fires,
`prompt.batch.collect.js` writes `.claude/batch-handoff.json`; until the
`do-run` / `auto-concept` call clears it, edits and `git commit` are refused
(`deep-knowledge/merge.md` § Hand-off gate).

```
--from=do-batch
Notizen: <archived path from 4.7>
Abdeckung: #1 … #N, one line each, dispositions as in 4.2
Plan: <the merged plan, every note detail kept (4.4.1)>
Bündel:
  B1 <area name> — Notizen #…; besitzt <files/surfaces>; Schnittstellen: <contract with Bx>; nach: <Bx | —>; Prüfung: <verification>
     Befunde: <file:line facts, approach, traps from 4.3 | —>
  B2 …
Konflikte / nicht machbar: <each one named, with the default taken or "offen">
Offene Entscheidungen: <auto-concept only — the forks that made 4.6 route here>
```

- **do-run** skips its question 1 ("Was?") on `--from=do-batch` — the answer
  is "Prompt umsetzen", with this plan as the prompt — and asks its remaining
  questions (Ablauf, Umfang, Durchgänge) as usual. It then executes through
  `auto-agents`.
- **auto-concept** opens with this plan as iteration 1 and every open
  decision as a decision item (its Step 0.5 § Started from do-batch).
- The `Bündel:` section travels unchanged on both routes. `auto-agents` uses
  it for its waves: one agent per bundle, file ownership as given, a bundle
  with `nach:` in a later wave. It does not work the split out again, and it
  puts each bundle's `Befunde:` into that agent's prompt as its starting point.

Never both, and never implement anything here before the hand-off: the
receiving skill owns the run from this point.
