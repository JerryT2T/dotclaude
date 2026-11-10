# Ship — merge decisions (`needs: "merge-decisions"`)

Referenced by `/do-ship` § Decision points. The rules (anchor, classes, chain,
ledger) live in `{PLUGIN_ROOT}/deep-knowledge/merge-safety.md` § Parallel
shipping without losses; this file is the end-to-end flow at the gate.

## What the gate returns

`ship_run` integrates `origin/<base>` by `git merge`, then runs the survival
check (`hooks/lib/survival.js`) against the knowledge anchor
(`hooks/lib/knowledge-anchor.js`). While a lost hunk is neither restored nor
decided, the merge never happens:

```
{ ok: false, needs: "merge-decisions",
  detail: { where, lost: [{ id, file, hunk, upstreamPr, author, verdict, missing, resurrected }],
            survivedCount, resolvedCount, anchor, prLeftOpen? },
  resume: { mergeDecisions: { resolved: [...] } } }
```

`where` names the check that fired (`preflight` | `after-integration` |
`resume` | `pre-merge`); at `pre-merge` the PR stays open (`prLeftOpen`).
A `resolved` item is `{ hunk: <lost id>, action: "restored" | "decided",
aspect?, value?, by?, ship?, chain? }` — `aspect` / `value` / `by` / `ship` only
for `decided`. When the check cannot run (no `origin/<base>`, no anchor, git
error) the ship continues with `survival.skipped` and a warning.

`verdict` is computed by code; the classification beyond it is yours:

| Verdict | Meaning | You |
|---|---|---|
| `unseen-lost` | upstream hunk gone, own side never touched that element | restore it |
| `moved` | upstream value sits in a container the own side restructured | restore into the NEW structure |
| `same-aspect-candidate` | own side changed the same element + same property / logic branch | classify; decision |
| `overlap-candidate` | regions overlap, aspects unclear (incl. own cross-cutting rule covering the element) | read both diffs, then classify as one of the above or `rule-vs-exception` |

Code never picks a side. Boundary: automatic only when different elements or
different properties changed; same element + same property (colour, shape,
position, logic branch) is always a decision.

## Flow

1. **Restore** every `unseen-lost` / `moved` hunk by hand, hunk-wise, in the
   new structure (add the lines where the container now lives; never overwrite
   a whole file, never `--ours/--theirs`). Commit once
   (`fix(merge): restore <n> upstream changes`).
2. **Apply the ledger.** Aspects already decided in `.claude/merge-decisions.json`
   (key `<file>›<element or symbol>›<property>`) are re-applied silently. Per
   the chain rule you are asked about an aspect only when you changed it
   without knowing the decision (it landed after your anchor); you then see the
   whole chain and decide as the last shipper.
3. **Classify** the remaining candidates: `same-aspect`, `rule-vs-exception`,
   or `restore` after all.
4. **Surface** (below). Collect all answers, apply them, record each in the
   ledger (`{ ship, by, value, decided: true, at }` appended to the chain).
5. **Re-call** `ship_run` with the same params plus
   `mergeDecisions: { resolved: [...] }`. It re-runs the survival check; the
   list must be empty before the merge — the check runs again right before the
   PR merge.
6. **After the merge** post ONE `gh pr comment` on each overruled earlier PR
   (only `same-aspect` / `rule-vs-exception` decisions that replaced a value):
   aspect, before, after, who decided. Fire and forget; a failed comment never
   undoes the ship.

The sync hook may already have queued open decisions in
`.claude/merge-queue.json`; the gate reads the same queue, so a question
answered mid-session is not asked again.

## Surfacing — what the user sees

| Decision touches | Surface |
|---|---|
| anything visible (UI file, CSS, template, asset, copy) | ALWAYS an auto-concept page, even for one tiny decision |
| non-visual logic / structure | `AskUserQuestion`, at most 3 per round (more: batch the rest into a concept page) |

**Concept page layout.** Run `/auto-concept` with one decision block per
aspect, four columns: **Basis** (value at the anchor) | **other shipper**
(value, author, PR) | **you** (your branch's value) | **proposal** (your
recommendation, with the reason). Add screenshots of each side when the
project has a preview. The user's pick per block is the decision.

**Under `$SHIP_LOCKOUT`** never ask: restore what is automatic, then park this
branch — `ship_cleanup({ branch, cwd, keep: true })`, a `ship-blocked` card
that lists the prepared decisions (aspect, both values, proposal) and the
reason "merge decisions needed". The run continues with the next item.
