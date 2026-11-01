# Skill trim record — progressive disclosure (pass 2026-11)

Five skills moved branches that only some invocations take out of `SKILL.md`
into `skills/<skill>/deep-knowledge/*.md`, each behind one pointer line at
the place the text used to stand. Unlike the earlier word-level trims
(`auto-agents.md`, `do-batch.md`, …) nothing is reworded away: the moved text
is verbatim, the text tests read `SKILL.md` with the pointers joined back
(`auto-agents/skill-source.js`, `auto-concept/skill-source.js`, the
`FIRE_POINTER` join in `do-batch/skill-text.test.js`).

Variant A = `origin/main` (`d25acf1b`), variant B = snapshot copies of this
branch. Results dirs live in the session scratchpad (not committed).

## Sizes

| Skill | `SKILL.md` bytes A | B | Δ | Moved to |
|---|---|---|---|---|
| `auto-concept` | 37 876 | 33 826 | −10 % | `step0-report.md` (new: `--report` entry), `step1-templates.md` § 1a · Variant overview and orthogonality, `step5-finalize.md` § C step 0 and § D steps 2–3, `step5-update-page.md` § Reality-check round (forced-round paragraph) |
| `auto-agents` | 28 861 | 23 221 | −19 % | `permission-audit.md` (Step 2.3), `mode-question.md` (Step 4 question), `burn-conveyor.md` (Step 6 `--burn` loop) |
| `do-batch` | 25 949 | 17 015 | −34 % | `fire.md` (all of Step 4; the marker path never loads the skill — the hook carries the procedure), four duplicate Rules dropped |
| `auto-cleanup` | 24 679 | 22 377 | −9 % | `open-prs.md` (Step 5b per-PR detail, only with ≥1 open PR); "Where this skill sits" table condensed to prose |
| `auto-harden` | 20 781 | 18 897 | −9 % | `ship-path.md` (H1–H7 spec of `scripts/ship-harden.js`) |
| **Total** | 138 146 | 115 336 | −17 % | ≈ 5.7k tokens less across one load of each |

## Reverted / fixed during the A/B

| # | Change | Evidence | Outcome |
|---|---|---|---|
| 1 | Pointers written as bare `deep-knowledge/x.md` | `ceremony-plan` B: the model read `{PLUGIN_ROOT}/deep-knowledge/ceremony-plan.md` (plugin root — where `agent-orchestration.md` lives under the same spelling), missed, and presented the plan without its heading and budget line (heading 2/5 vs A 4/4). `scripts/skill-contracts.test.js` § bare deep-knowledge refs flagged the same ambiguity | every new pointer names `{PLUGIN_ROOT}/skills/<skill>/deep-knowledge/…`; the plugin-level refs of `auto-agents` and `auto-harden` are qualified with `{PLUGIN_ROOT}/` |
| 2 | `auto-agents` Step 3 plan template moved to `ceremony-plan.md` | with the path fixed: heading 3/4, budget line 2/4 vs A 4/4 at that point | **reverted** — template, locale labels and budget-line rule are inline again; only the Step 4 question stays out (`mode-question.md`). Later A runs showed A misses too (heading 1/3 in one batch), so the gap was probably noise — the revert stands anyway: the rule is that a lost grader point reverts |

## Results — final variant

Pass counts per grader, summed over every batch that ran the skill's final
moves (A = `origin/main` in every batch it ran in). For `do-batch`,
`auto-cleanup`, `auto-harden` and `auto-concept` the B sum includes snapshots
taken before row 1 qualified the pointer paths; `do-batch/go-merge`,
`auto-cleanup` and `auto-harden` also ran B-only on the final snapshot
(12/12, 8/8, 14/14), `auto-agents` only counts the final snapshot.

| Case | Grader | A | B |
|---|---|---|---|
| `auto-concept/decision-page` | all 8 graders | 16/16 | 16/16 |
| `auto-agents/inline-one-file` | agents-skill · inline-line · no-role-agent · typo-fixed | 2/2 · 1/2 · 2/2 · 2/2 | 4/4 · 4/4 · 4/4 · 4/4 |
| `auto-agents/ceremony-plan` | agents-skill · plan-heading · budget-line · plan-card · no-role-agent | 7/7 · 5/7 · 5/7 · 6/7 · 6/7 | 7/7 · 6/7 · 5/7 · 7/7 · 7/7 |
| `do-batch/activate-and-seed` | all 5 graders | 15/15 | 15/15 |
| `do-batch/go-merge` | all 6 graders | 18/18 | 30/30 |
| `auto-cleanup/manifest-before-delete` | cleanup-skill · page-or-manifest · no-delete-attempt · no-unmerged-delete | 2/2 · 0/2 · 2/2 · 2/2 | 4/4 · 4/4 · 4/4 · 4/4 |
| `auto-harden/ship-path-json` | all 7 graders | 14/14 | 28/28 |

Baseline (before any edit, current text = A, 1 run each): 20/21 — only
`auto-cleanup::page-or-manifest` missed, as it does in A above.

Cost, A → B in the same batch: `auto-concept` + `auto-cleanup` (4 runs
each) $5.46 → $4.55, `ceremony-plan` (3 runs each) $4.03 → $1.89, `do-batch`
(6 runs each) $4.86 → $4.89, `auto-harden` (2 runs each) $0.93 → $0.98.

## Verdict

`ship with kept rows above` — no grader is lower in B than in A on the final
text; the one regression measured (row 1/2) was fixed and its template move
reverted.

## Eval cases used

| Case | Covers |
|---|---|
| `skills/auto-concept/decision-page` | decision page built by `concept-build.js`, panel, no clipboard / browser |
| `skills/auto-agents/inline-one-file` | Inline tier, `▶ Inline` line, no agent |
| `skills/auto-agents/ceremony-plan` (new) | full-ceremony plan: heading, budget line, plan card, no spawn before the yes |
| `skills/do-batch/activate-and-seed` | activation path (Step 2, unchanged) |
| `skills/do-batch/go-merge` (new) | `go` without the hook context: the moved Step 4 |
| `skills/auto-cleanup/manifest-before-delete` | deletion gate, manifest |
| `skills/auto-harden/ship-path-json` | ship path returns the script's JSON |

Not covered by a case: the `auto-concept --report` entry, the design variant
overview, the finalize parts C/D, the `auto-cleanup` open-PR inventory (needs
a `gh` stub with open PRs) and the burn conveyor — all moved verbatim behind
a pointer; their text tests still pass on the joined text.

## Case artefacts found on the way

- `do-batch/activate-and-seed` denies `*batch-watchdog*`; when the model
  chains `activate` and `watchdog start` in one command the whole command is
  denied and the run derails (seen in both A and B). Left as is.
- `do-batch/go-merge` therefore does not deny the watchdog, and its
  `coverage-list` grader also accepts the coverage carried only in the
  hand-off body.
- `auto-agents/ceremony-plan` scaffolds ten files and denies PowerShell: on a
  four-file repo one run classified the feature Inline and implemented it
  through PowerShell past the Edit/Write deny.
