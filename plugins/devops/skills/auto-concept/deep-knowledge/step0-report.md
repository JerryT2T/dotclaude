# Concept report-only entry — the Abschluss without a prior concept

The `--report` entry of `SKILL.md`, moved here verbatim: only a `--report` call reads it. The `##` section below is named by exactly one mandatory pointer in `SKILL.md`; read it completely before executing that entry — it is as binding as the step itself.

## Report-only entry

Other skills call `auto-concept --report` as the step **after an
implementation** that had no concept page (`do-run`, `auto-fix`, `do-backlog`,
`do-audit`): the user gets the same Abschluss page, bridge and close-out FAB a
concept ends with, but the page has exactly one round — the final report.
Steps 0.5 to 1 and Step 5's iterate/implement branches do not apply.

1. **Open only when there is something to do.** The page exists only if at
   least one of these is true: a Fund out of scope (admission gate: `found`
   only), a 🧪 test the user must do, a 👉 hand-off, or an open ship decision
   (work is committed but not shipped). Otherwise skip the page, the bridge and
   Edge entirely: the completion card alone ends the run. After a
   devops-concept implementation the Abschluss is mandatory (the report is
   appended to that concept instead; this entry is not used).
2. **Scaffold.** `node "{PLUGIN_ROOT}/scripts/concept-build.js" init docs/concepts/{date}-{slug} --report --title "<what was done>" --locale <de|en>`
   (in the caller's worktree). Round 01 is a final-report skeleton
   (`data-iteration="1" data-iteration-template="free" data-final-report`).
3. **Author the report from the implementation context** — what was done, the
   commit(s), tests actually run, QA evidence, the Funde / 🧪 / 👉 rows with
   their pre-selection (`deep-knowledge/step5-update-page.md` § Final-report
   append and `deep-knowledge/step5-finalize.md` § E). The run's decision
   journal, if any, goes short into the dev fold. Replace every TODO
   placeholder, then `build` (gate), as in Step 2.
4. **Step 3 unchanged** (bridge, pulser, waker, real Edge), then Steps 4–5 with
   the page's only legal action, `finalize` (parts A–E as above; B builds the
   Funde the user routed to "Jetzt umsetzen", C ships on the "Abschließen &
   shippen" button). Under autonomous callers the page waits for the user's
   return; the caller's completion card is rendered by the caller after Step 6a.
5. **Scope.** Decisions about backlog issues and audit proposals stay concept
   pages with decision rounds (`/do-backlog`, `/do-audit`); this entry is
   never used for them, only for the Abschluss after their implementation.
