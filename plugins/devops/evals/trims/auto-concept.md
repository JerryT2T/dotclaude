# Skill trim record — `auto-concept` (pass 1)

Filled from `TRIM-TEMPLATE.md`. Variant A = the skill's text before the trim,
variant B = the trimmed text.

## Skill

| Field | Value |
|---|---|
| Skill | `devops:auto-concept` (`plugins/devops/skills/auto-concept/`) |
| Files | `SKILL.md`, `deep-knowledge/step4-monitor.md`, `deep-knowledge/pause-resume.md`, `deep-knowledge/artifact-fallback.md` |
| Issue | #722 (umbrella #688) |
| Lines / words before (A) | `SKILL.md` 498 / 5283; `step4-monitor.md` 46; `pause-resume.md` 47; `artifact-fallback.md` 48 (`origin/main` 8797cc5c) |
| Lines / words after (B) | `SKILL.md` 430 / 4620 (−14 % lines, −13 % words); `step4-monitor.md` 41 / 331; `pause-resume.md` 44 / 342; `artifact-fallback.md` 47 / 399 |
| Variant A | `origin/main` via `--a-ref` (batch 1: 8797cc5c; batch 2: b3df3b2a — `skills/auto-concept/` identical in both) |
| Variant B | working tree of `refactor/722-auto-concept-trim-1` (batch 1 at cd7aeeb7, batch 2 at dfe6d703) |
| Runs per variant | 2 (batch 2: 1 valid — see Verdict) |
| Results dir | `plugins/devops/evals/results/ab-2026-10-16T15-16-19-453Z` (batch 1), `…/ab-2026-10-16T15-53-51-672Z` (batch 2) — not committed |

## Removed instructions

Batch 1 = commit `refactor(auto-concept): trim SKILL.md rationale prose`,
batch 2 = commit `refactor(auto-concept): trim rationale in small
deep-knowledge files`. Every guard sentence that `skill-source.test.js`
pins inline and every `**Before executing this step, …**` pointer line stays
verbatim. A/B numbers are the case total (8 graders × runs).

| # | Excerpt (removed text) | Reason for removal | A/B result | Verdict |
|---|---|---|---|---|
| 1 | Step 0 "Use **Glob** to verify … Do NOT call Read on files that may not exist" | two sentences for one rule; condensed to one line | batch 1: 16/16 → 16/16 | keep |
| 2 | Step 1a "Pick via the strict ordered check below …" paragraph | duplicated the bold "Order of evaluation" line; merged into it | batch 1: 16/16 → 16/16 (`no-mode-question`, `decision-panel` 2/2 → 2/2) | keep |
| 3 | Step 1a items 1–3 body prose (viewport real-estate, count preference repeat, "Only reach this step after 1 AND 2") | examples and repeats of Step 0.5; kept the trigger lists and the design-mode skip | batch 1: 16/16 → 16/16 | keep |
| 4 | Template continuity rationale ("belongs to the concept, not to the mood of a round", why the design layout cannot hold a report) | explanation; rule, `data-view-kind="decision"` and both exceptions kept | batch 1: 16/16 → 16/16 (not exercised: one round only) | keep |
| 5 | Post-generation validation list of Phase 1 patterns | the build enforces Phase 1 by construction; list lives in `validation-gate.md` | batch 1: 16/16 → 16/16 (`page-built`, `built-by-script` 2/2 → 2/2) | keep |
| 6 | Step 3 forbidden-list continuation sentences (preview iframe, Playwright, `file://`, why the clipboard hand-off is wrong) | rationale; every bullet head (test-pinned), the `preview_eval` exception and the `post.concept.gate` note kept | batch 1: 16/16 → 16/16 (`no-browser-tool`, `no-clipboard-handoff` 2/2 → 2/2) | keep |
| 7 | Finalize "Fixed execution order" rationale | shortened to one clause per part; order sentence and "Never reorder" kept | batch 1: 16/16 → 16/16 (not exercised) | keep |
| 8 | "/reset is the LAST step" mechanism (`_processed_at`, `pollProcessedState`) | implementation detail; consequence kept in one sentence | batch 1: 16/16 → 16/16 (not exercised) | keep |
| 9 | Final-report append intro | duplicate of the 5c action list; now names `data-iteration-template="free"` | batch 1: 16/16 → 16/16 (not exercised) | keep |
| 10 | Step 6 / 6a intros | duplicate of the 6a pointer; kept "nothing may still run when the card renders" | batch 1: 16/16 → 16/16 (not exercised) | keep |
| 11 | UNPROCESSED guard rationale | shortened; bold guard (test-pinned) and the path kept | batch 1: 16/16 → 16/16 (not exercised) | keep |
| 12 | 6c pause summary (stop list, state-file mark, resume steps) | duplicate of `pause-resume.md`; pointer kept | batch 1: 16/16 → 16/16 (not exercised) | keep |
| 13 | Smart Trigger Rules numbered lists | 18 lines → 4; every trigger, the suggestion phrase and every exclusion kept | batch 1: 16/16 → 16/16 (not exercised) | keep |
| 14 | Rules: duplicate "self-contained HTML" bullet and its wordier twin | duplicate | batch 1: 16/16 → 16/16 | keep |
| 15 | `step4-monitor.md` Backstop rationale and "Important" paragraph | explanation of why the cron cannot cover the gap; consequence kept | batch 2: 8/8 → 8/8 (1 run each; not exercised — bridge denied in the case) | keep |
| 16 | `pause-resume.md` pause intro rationale | why leaving processes running is wasteful | batch 2: 8/8 → 8/8 (not exercised) | keep |
| 17 | `artifact-fallback.md` wrapper note ("same rule as `concept-server.py`", "behave exactly as before") | rationale; both contract facts kept | batch 2: 8/8 → 8/8 (not exercised) | keep |

## Kept instructions that looked prescriptive

| # | Excerpt (kept text) | Why kept |
|---|---|---|
| 1 | "No reachable bridge ≠ no concept" section | the eval harness denies the bridge; this is the text that keeps the page on the engine (`page-built`, `built-by-script`) |
| 2 | Step 3 "MANDATORY — Real Edge browser only" bullet heads | hook-enforced (`post.concept.gate`) and test-pinned; drive `no-browser-tool` / `no-clipboard-handoff` |
| 3 | Step 5b implement step 0 (reality check) | test-pinned guard |
| 4 | Part C ship steps, "The ship card comes last", force-push confirmation | ship gate and completion-card contract |
| 5 | 6b "Output the returned markdown VERBATIM as the LAST thing" | stop-hook completion-card contract |
| 6 | All `**Before executing this step, (Re-)Read …**` pointer lines | `skill-source.js` resolves them; Step 5 re-read wording is test-pinned |

## Eval cases used

| Case | Graders | Why this case |
|---|---|---|
| `skills/auto-concept/decision-page` (#721) | `concept-skill`, `no-mode-question`, `page-built`, `built-by-script`, `no-hand-written-page`, `decision-panel`, `no-clipboard-handoff`, `no-browser-tool` (graders.js) | the skill's first-round contract: mode question skipped when pinned, page built by `concept-build.js`, decision panel present, no clipboard hand-off, no preview/browser tool |

Command (both batches):
`node plugins/devops/evals/ab-run.js --case plugins/devops/evals/skills/auto-concept/decision-page --a-ref origin/main --runs 2 --timeout-min 15`

## Per-grader results

| Batch | Grader | A | B |
|---|---|---|---|
| 1 | concept-skill | 2/2 | 2/2 |
| 1 | no-mode-question | 2/2 | 2/2 |
| 1 | page-built | 2/2 | 2/2 |
| 1 | built-by-script | 2/2 | 2/2 |
| 1 | no-hand-written-page | 2/2 | 2/2 |
| 1 | decision-panel | 2/2 | 2/2 |
| 1 | no-clipboard-handoff | 2/2 | 2/2 |
| 1 | no-browser-tool | 2/2 | 2/2 |
| 2 | all eight graders | 1/1 each (1 n/a) | 1/1 each (1 n/a) |

## Summary

Tokens = input + output + cache read/creation, summed over the runs.

| Variant | Pass rate (all graders) | Tokens | Cost | Mean duration | Errors |
|---|---|---|---|---|---|
| A (batch 1) | 16/16 | 8,684,217 | $10.53 | 591 s | 0 |
| B (batch 1) | 16/16 | 7,627,269 | $9.44 | 488 s | 0 |
| A (batch 2) | 8/8 | 4,179,546 | $5.94 | 377 s (valid run) | 1 (session limit) |
| B (batch 2) | 8/8 | 4,053,358 | $4.59 | 462 s (valid run) | 1 (session limit) |

## Verdict

`keep` — no grader point lost in either batch. Batch 1 (the `SKILL.md`
cuts): 16/16 → 16/16, B 12 % fewer tokens and $1.09 cheaper over two runs.
Batch 2 (cumulative, adds the deep-knowledge cuts): 8/8 → 8/8 on the one
valid run per variant; run 2 of both variants ended after 12–65 s with
"You've hit your session limit" and is n/a, not a failure. The case covers
only the first round (bridge denied), so cuts 4 and 7–17 are
not exercised by it — they remove rationale only, every rule sentence and
every test-pinned guard stays, and the auto-concept / evals / concept-gate
/ session-start suites pass. A follow-up should re-run batch 2 with
`--runs 2` once the limit resets, and a case that reaches Step 5 (submit →
next round) would cover the later cuts.

# Pass 2 — `validation-gate.md` and `bridge-server.md`

Same method as pass 1. Variant A = `origin/main` (28e93c9a). Variant B = a
snapshot copy of `plugins/devops` at each batch commit (`--b <snapshot>`), so
later edits could not leak into a running B.

| Field | Value |
|---|---|
| Issue | #723 (umbrella #688) |
| Files | `deep-knowledge/validation-gate.md`, `deep-knowledge/bridge-server.md` (`templates-*` are not in #723's scope) |
| Lines / words before (A) | `validation-gate.md` 656 / 13980; `bridge-server.md` 1042 / 9108 |
| Lines / words after (B) | `validation-gate.md` 598 / 12264 (−9 % lines, −12 % words); `bridge-server.md` 900 / 7471 (−14 % lines, −18 % words) |
| Batches | batch 1 = `refactor(auto-concept): trim validation-gate rationale prose` (bbc81783); batch 2 = `refactor(auto-concept): trim bridge-server rationale prose` (05fa4246), cumulative |
| Runs per variant | 2 per batch |
| Results dir | `plugins/devops/evals/results/ab-2026-10-16T23-51-40-279Z` (batch 1), `…/ab-2026-10-17T00-32-04-204Z` (batch 2) — not committed |

## Removed text

Every gate row, pattern literal, `§ heading`, pointer line, exit reason,
endpoint and status code stays. A cut removes the incident story or the
"why" behind a rule. The rule sentence stays. After each cut the auto-concept
and concept-gate suites ran. A test failure reverted the cut (rows R1, R2).

| # | Excerpt (removed text) | Reason | A→B | Verdict |
|---|---|---|---|---|
| V1 | backstop note: "safety net for the 'skill only half-used' regression" | rationale | batch 1: 15/16 → 16/16 | keep |
| V2 | Phase 0 "never copies anything out … only sanctioned mechanism, may never be omitted" | repeats the Phase 0 intro | batch 1: same; `no-clipboard-handoff` 2/2 → 2/2 | keep |
| V3 | Phase 0b intro (story of the carried-over `<style>` line) | incident story, condensed to one clause | batch 1: same | keep |
| V4 | why `--accent-color` is the probed token | rationale | batch 1: same (not exercised: no browser) | keep |
| V5, V7–V20, V22, V23, V23b, V25, V26, V28, V39 | the history and consequence clauses in rows 12b, 28b, 30b, 33, 38, 41, 45, 46, 47, 49, 51, 52, 54, 62, 62b, 64, 65, P13e, P14b, P18, P21b ("used to …", "measured on a real page …", "Round 11 of a design concept …", "Without it, …" chains) | the incident or the consequence of a missing pattern; the pattern, the hard-fail/warning level and the fix stay | batch 1: same; `page-built`, `built-by-script`, `decision-panel` 2/2 → 2/2 | keep |
| V21 | row 57: the story of the first `position: fixed` fix | condensed to the rule "never fixed off a sampled viewport rect" | batch 1: same (not exercised) | keep |
| V31 | Pre-Kompass "no carve-out" rationale | rationale; the rule and "re-sync never edits `section[data-iteration]`" stay | batch 1: same (not exercised: one round) | keep |
| V32 | Engine drift: "user reports 'still 4 attachment bars' …" | anecdote | batch 1: same (not exercised) | keep |
| V33 | why P3/P5 carry alternates | rationale; both id pairs and "accept both, prefer the new ones" stay | batch 1: same | keep |
| V36, V37 | 49–53 "single worst thing this system can do" and why the append is the moment | rationale | batch 1: same (not exercised) | keep |
| V38 | P14–P21 "not a design without opinions …" | rhetoric | batch 1: same (not exercised) | keep |
| V34 | "Common failures this gate catches" list (33 of 34 bullets) | each bullet repeats its row's Purpose column; the test-pinned `data-oq-origin` bullet stays | batch 1: same | keep |
| R1 | entry 44 "The four-literal form of 44 is deliberate …" paragraph | pinned by `design-chrome-overlap.test.js` (`/PASSED it while rendering/`) | — | reverted before A/B |
| R2 | the `data-oq-origin` common-failure bullet | pinned by `open-points-admission.test.js` | — | reverted before A/B |
| B1, B2 | timestamp note: "single most expensive silent failure", why ISO strings | rationale | batch 2: 16/16 → 16/16 | keep (not exercised: bridge denied under `-p`) |
| B3 | step 1 code comment: version-dir history | story; `sort -V` / never `head -1` stays | batch 2: same | keep (not exercised) |
| B4–B9 | step 2: reaped-child detail, Defect B history, `SO_REUSEADDR` double-bind story, old `Stop-Process` guidance, single-threaded failure walk-through, 30 min calibration | incident stories; every MUST (registry pick, `can-claim` gate, exclusive bind, threaded server, `--html`, timeouts) stays | batch 2: same | keep (not exercised) |
| B10–B13 | step 3: per-minute cron cost story, 1128-char prompt story, MODULE_NOT_FOUND story, `Concept bridge, port N —` lead-in example | rationale; both load-bearing prompt phrasings and the CronCreate block (test-pinned) stay | batch 2: same | keep (not exercised) |
| B14, B15 | "Why a script and not a Read per tick", "Why combined" | rationale; the `/pending` reason condensed to one sentence | batch 2: same | keep (not exercised) |
| B16–B22 | 638 s cron gap, single-watcher flaw story, why the watchers need a launch check, the four ways the inline loop broke, 2026-09-20 timing story, shutdown-on-rename story, Sleeping Tab history | incident stories; `sleep 20` (test-pinned), every exit reason, `--grace`/`--timeout`/`--dead-after`/`--confirm` and the duplicate-watcher rules stay | batch 2: same | keep (not exercised) |
| B23–B28 | 4b: why the store refuses to start, why `drafts/` exists, keepalive-quota story, "losing a comment requires losing the disk", why read `/recovery`, "before this, `/pending` answered false" | rationale; layout, endpoints, header rule, "restart on the same port" stay | batch 2: same | keep (not exercised) |
| B29–B33 | 4c: response-shape convenience, why the second disk check is authoritative, old SVG-ban rationale, the `payload.png` attack walk-through, why `index.json` exists | rationale; caps, shapes, error table (test-pinned), magic-byte rule and serving policy stay | batch 2: same | keep (not exercised) |
| B34–B36 | step 5: why a naked POST is not enough, why pre/post, why 3 s | rationale; the script stays | batch 2: same | keep (not exercised) |

## Per-grader results

| Batch | Grader | A | B |
|---|---|---|---|
| 1 | concept-skill | 2/2 | 2/2 |
| 1 | no-mode-question | 1/2 | 2/2 |
| 1 | page-built, built-by-script, no-hand-written-page, decision-panel, no-clipboard-handoff, no-browser-tool | 2/2 each | 2/2 each |
| 2 | all eight graders | 2/2 each | 2/2 each |

## Summary

| Variant | Pass rate | Tokens | Cost | Mean duration | Errors |
|---|---|---|---|---|---|
| A (batch 1) | 15/16 | 8,685,473 | $11.65 | 556 s | 0 |
| B (batch 1) | 16/16 | 11,157,793 | $11.58 | 609 s | 0 |
| A (batch 2) | 16/16 | 8,872,507 | $10.40 | 479 s | 0 |
| B (batch 2) | 16/16 | 7,805,916 | $9.02 | 496 s | 0 |

## Verdict

`keep`: neither batch lost a grader point. The batch-1 A miss
(`no-mode-question`, run 2) happened on the untouched `origin/main` text, so
it is run variance, not an effect of the cut. B's higher batch-1 token total
is also variance (cache reads 10.6 M vs 8.0 M, cost even). In batch 2 (both
files cut), B used 12 % fewer tokens and cost $1.38 less over two runs. The
case covers only the first round and denies the bridge, so it does not
exercise the gate's later-round rows or any `bridge-server.md` cut. Those cuts
remove rationale only, and every test-pinned sentence stays. The
auto-concept, concept-gate, session-start and scripts suites pass, except
`concept-build.test.js` (also fails on `origin/main`'s copies of both files)
and `burn-plan.robustness.git.test.js` / `git-sync.conflicts.test.js`, which
read neither file.

---

# Pass 2 — Opus 5.5 rule model

Model: contracts up front, verification after each round, depth only on a
repetition. Basis: Anthropic's Opus 5.5 / Fable 5 / skill best-practice
guidance (minimal instructions, one-level references, "Run x.js" vs "See
x.md", tools instead of generic verify lines, fresh-context verifiers, no
emphasis caps) and the real concept `20261030-1850-analyse-redesign`, where the
user repeated four remarks across rounds that rest-state screenshots never
showed (FAB overlap on hover R6→R7, single-line label/input R6→R8, cursor
R6→R8, visual highlight R2→R4).

## Skill

| Field | Value |
|---|---|
| Skill | `devops:auto-concept` (`plugins/devops/skills/auto-concept/SKILL.md`) |
| Lines before → after | 495 → 481 (`wc -l`; body < 500) |
| Words before → after | 5,141 → 4,738 (−8 %, `wc -w`; adds the coverage step, patterns list, repeat depth and read list; drops the pointer mandate prose; moves two blocks out) |
| Mandatory per-round read before | SKILL.md + 26 "Re-Read … completely on every round" sections = 5,141 + 10,852 = **15,993 words** (plus `validation-gate.md`, 9,446, named in Step 2 for every build: ≈ 25.4 k) |
| Mandatory per-round read after | SKILL.md + the 7-entry "A feedback round reads" list = 4,738 + 3,053 = **7,791 words** (−51 %); everything else on demand |
| Variant A | `--a-ref origin/main` (a0efaa0f, incl. #1001/#1007) |
| Variant B | this branch |
| Runs per variant | 2 (5 cases; results `evals/results/ab-2026-11-01T14-07-26-867Z`, not committed) |

## Removed or rewritten instructions

| # | Excerpt (removed / rewritten text) | Reason | A/B result |
|---|---|---|---|
| P2-1 | 54× "**Before executing this step, Read `…` § … completely** — …" | mandate → reference "See `…` § …. <what it holds>."; read when the step needs it (one level deep) | batch A/B below: no grader regressed |
| P2-2 | 26× "Re-Read … completely on every round — even if read earlier in this session" | forced ≈ 10.9 k words of re-reading per round, including finalize parts A–E, legacy actions and implement detail an `iterate` round never runs; replaced by a 7-section round read list and "re-read only after a compaction" | batch A/B below: no grader regressed |
| P2-3 | "Order of evaluation (mandatory, per iteration)" | emphasis; "first match wins" is the contract | batch A/B below: no grader regressed |
| P2-4 | "it is MANDATORY on every section you append" | caps → "required"; gate 12b still enforces it | batch A/B below: no grader regressed |
| P2-5 | "### Engine source (mandatory — …)", "### Post-Generation Validation (mandatory gate)" | heading emphasis; "If ANY pattern is missing → DO NOT open the page." stays verbatim | batch A/B below: no grader regressed |
| P2-6 | "NEVER open a separate browser window", "MUST be opened in the user's real Edge" | caps → plain; the forbidden-alternatives list and the `### MANDATORY — Real Edge browser only` heading (test-pinned contract) stay | batch A/B below: no grader regressed |
| P2-7 | "you MUST NOT render a second concept completion card", "Output … VERBATIM as the LAST thing" | caps → plain wording, same rule | batch A/B below: no grader regressed |
| P2-8 | Report-only entry steps 1–5 | moved verbatim to `deep-knowledge/step0-report.md` § Report-only entry (main #1021 moved the same text there); only `--report` runs read it | batch A/B below: no grader regressed |
| P2-9 | Step 1a "≥2 designs → the variant overview" + "Orthogonality — a view never re-asks …" | moved verbatim to `step1-templates.md` § 1a · Variant overview and orthogonality; the pointer line keeps the rule summary | batch A/B below: no grader regressed |

## Added

| # | Text | Why |
|---|---|---|
| P2-A1 | "How this skill reads" + "A feedback round reads" list | names the small set a round needs; "Run x.js" = execute, use the output |
| P2-A2 | Step 5c "Coverage before `/reload`": run `scripts/concept-coverage.js`, fill every evidence slot of `checks/NN.md` with a tool result from this session showing the element in the named state (hover, FAB rects, computed cursor, focus / scroll / transition) | the session verifies with a tool, not a generic "double-check" line; a rest-state screenshot counts for `rest` only |
| P2-A3 | "Patterns to avoid" (hover overlap with ☰ / 💬, label vs input, cursor, highlight answered with a tweak) | the four observed misses; grows from REPEAT findings |
| P2-A4 | "On a `REPEAT …` line": fresh-context `qa` reviewer with both remarks + the page, fix in this round, `do-learn`, replay eval case modelled on `round-replay-r6-hover` | depth only where the cheap path already failed once |
| P2-A5 | `step5-update-page.md` § 5c · Append procedure step 4.5 (coverage between `build` and `/reload`) | the numbered procedure and SKILL.md keep one order |

## Kept instructions that looked prescriptive

| # | Excerpt | Why kept |
|---|---|---|
| P2-K1 | "**Order matters — `/reset` is the LAST step, NOT the first.**" | bridge contract (duplicate submission); test-pinned |
| P2-K2 | "**If ANY pattern is missing → DO NOT open the page.**" | gate contract; test-pinned |
| P2-K3 | "**Fixed execution order — A … D (cleanup).** Never reorder", "The ship card comes last", force-push confirmation | irreversible-action ordering; test-pinned |
| P2-K4 | forbidden browser alternatives incl. the no-clipboard rule | hook-enforced (`post.concept.gate`); test-pinned |
| P2-K5 | "**Do NOT modify code, files, or external systems**" (iterate), UNPROCESSED guard, reality-check POST | irreversible-action guards; test-pinned |
| P2-K6 | every deep-knowledge `templates-*.md` | parsed by `scripts/concept-build.js`; untouched |

## Test pins changed

| Test | Change | Why |
|---|---|---|
| `skill-source.js` `POINTER` | matches "See `deep-knowledge/x.md` § Y. …" | new pointer form; `readSkill()` still joins every section losslessly |
| `skill-source.test.js` "Step 5 pointers demand a re-read on every round" | replaced by "the feedback-round read list is short and names existing step sections" | guarded the removed mandate prose (P2-2), not a contract |
| `skill-source.test.js` pointer checks | regex → new form; "no pointer left" compares against SKILL.md's own pointer lines | format change |
| `skill-source.test.js` (new) | Step 5c names the coverage command, the evidence rule, REPEAT handling and the replay template | pins the new contract |
| `template-continuity.test.js` | `/MANDATORY\|mandatory/` → `/MANDATORY\|mandatory\|required/` | P2-4 wording; the requirement stays pinned |

## Coverage / repeat script on the real data

`concept-coverage.js` replayed on `20261030-1850-analyse-redesign-decisions.json`
(each round against all earlier ones, threshold 0.38):

| Round | REPEAT line | True repeat? |
|---|---|---|
| R4 | `r4-s1 ~ round 3 r3-q2-s3-a3` (animate in sequence) | yes — R3 asked for the same sequenced animation |
| R7 | `r7-s2 ~ round 6 r6-r6-s1-a1` (hover overlap) | yes |
| R7 | `up-mvwc7h7kyhdo ~ round 6 r6-r6-s1-a1` (FAB overlap) | yes (required case) |
| R7 | `up-mvwcb33wnu69 ~ round 6 up-mvwbszeffcg6` (single-line input) | yes |
| R8 | `r8-r8-s3-a1 ~ round 7 up-mvwcb33wnu69` (label inline, single line) | yes |

No praise remark ("super!", "perfekt!", "ja sehr gut!") is flagged: praise
words are stopwords, and a remark needs ≥ 3 content stems plus a shared
anchor. Not caught: R2→R4 "visual highlight" (no shared vocabulary:
"kreativer in der Darstellung" vs "noch nicht das Highlight"); the patterns
list covers it instead.

## A/B (2026-11-01, 2 runs per variant, `--timeout-min 20`)

| Case · grader | A (main) | B (pass 2) |
|---|---|---|
| decision-page · all 8 | 2/2 | 2/2 |
| round-comment-fidelity · all 10 | 0/0 (2× timeout 20 min) | 2/2 |
| round-keep-option-open · all 9 | 2/2 | 2/2 |
| round-reopen-breadth · brief-verbatim | 0/2 | 2/2 |
| round-reopen-breadth · other 7 | 2/2 | 2/2 |
| round-replay-r6-hover · state-check-ran | 0/2 | 1/1 (1× timeout 20 min) |
| round-replay-r6-hover · toc-no-fab-overlap-on-hover | 2/2 | 1/1 |
| round-replay-r6-hover · toc-cursor-pointer | 2/2 | 1/1 |
| round-replay-r6-hover · toc-hover-no-dead-gap | 0/2 | 0/1 |
| round-replay-r6-hover · brief-verbatim | 1/2 | 0/1 |

Totals: A 10 runs, 2 errors, 17.5 M tokens, $18.94, mean 666 s · B 10 runs,
1 error, 17.8 M tokens, $17.99, mean 605 s (−9 %). Cache reads dominate the
token count, so the −51 % mandatory read shows up as time, not as tokens.

## Verdict

Keep. No grader got worse; B adds the state check the real concept lacked
(0/2 → 1/1), carries the user's words into the brief (0/2 → 2/2 on
reopen-breadth) and finished the comment-fidelity case that A timed out on
twice. Caveats: the FAB-overlap grader no longer discriminates, because
#1007 fixed that rail on main, so both variants pass it; `toc-hover-no-dead-gap`
fails on both and needs recalibrating before it can gate anything; B's
replay run 2 hit the 20-minute timeout, so the replay case has 1 valid B run.
