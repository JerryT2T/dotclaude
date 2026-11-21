# qax implement check — agent-einsatz-audit (diff 750b77d2..a536c2aa + SCC PR #1227)

| Line | Quote | Observed | Verdict |
|---|---|---|---|
| A1 | analyst anlegen | agents/analyst.md: name, description w/ <example> (302 chars), sonnet, color pink, tools Read/Grep/Glob/Bash/WebFetch; body jobs, read-only Bash rules, report format, "never edit" | done |
| A2 | analyst anlegen | agent-proactivity.md, -details.md, agent-orchestration.md (tier table l.23, models table): analyst for verdict reads, scout for locating, diagnose-only never to implementer | done |
| A3 | analyst in every registry | agent-card.js:51 icon, agent-card.test.js:10, agent-checkpoints.test.js:20, orchestration tables; agent-names.test globs agents/. README.md:463-467 agent table still lists aix/core/frontend, no analyst/builder | partial (README) |
| B1 | builder | agents/builder.md full frontmatter, sonnet, union tools incl. browser MCP + WebSearch/WebFetch | done |
| B2 | delete 3 | core/frontend/aix.md deleted (frontend.md renamed to builder.md) | done |
| B3 | sweep | grep devops:(core\|frontend\|aix) outside CHANGELOG: only pre.agent.model.js:26 rename map + rename test:8 (intended). Leftovers: README.md:463-467 rows, ui-defaults.md:16 `agents/frontend.md` | partial |
| B4 | tests/code map | agent-card, model gate, rename map, pending, mcp tests updated. BUT skill-text.test.js:117 still expects old wording "domain agent on `sonnet`; opus only for ..." removed from agent-proactivity-details.md -> FAIL; gen-readme-sections.test FAIL (README/architecture.html stale vs roster) | not done (suite red) |
| B5 | SCC SKILL | PR #1227 SKILL.md STEP 3 lines 57-60: devops:builder, analyst for diagnose items | done |
| C1 | Fork | agent-proactivity.md + details: fork rule, keeps session model, no model field | done |
| C2 | fork passes | agent-model-gate.js:94-95 wouldRefuse returns false for fork; tests pre.agent.model.rename.test.js:28,30. pre.agent.announce has no refusal. | done |
| D1 | shell passes | agent-apicredit-gate.js NEEDS_SHELL regex + wouldRefuse; tests in pre.agent.apicredit.test.js | done |
| D2 | one per message | leadsItsMessage(); tests "8 spawns in one message", mixed batch, later message; api-credits.md updated. Nit: spawn missing from transcript falls to old behaviour (doc says passes) | done |
| E1 | pin | backlog.md Step 2.1 analyst + model sonnet; auto-cleanup investigation.md analyst | done |
| F1 | general-purpose | agent-proactivity.md, details, orchestration: rule with reason example | done |
| G1 | opus medium / high | SCC SKILL l.41, 57-60, routine-watcher.mjs:52 comment; no xhigh | done |
| G2 | normal devops rules | SKILL STEP 3 one explicit rule; machine diagnose-only kept, names analyst (l.57, 64) | done |
| G3 | PR | PR 1227 open, not draft, not merged, branch chore/routine-agent-rules. Sync: routine-watcher.mjs:585 reads LIVE_PROMPT if it exists; REPO_PROMPT copied to live only at register/install (l.705), tick only reports promptInSync (l.721). Merge alone is NOT enough: re-register or copy file to ~/.claude/scheduled-tasks/scc-feedback-headless/SKILL.md | done (merge not sufficient) |
| H1 | final message is report | all 11 agent files carry the sentence (count 1 each) | done |
| H2 | stop hook | substop.agent.report.js: devops:* only, <30 words, blocks once; stop_hook_active + [agent-report] marker in transcript guard; try/catch + fail open; registered in lanes.json + manifest.json; test file with loop guard (73 lines) | done |
| I1 | 400 words | qax.md: report <=400 words, evidence in file | done |

## Extra checks
- a) see B3. b) analyst/builder frontmatter complete and parseable. c) hook cannot loop, fails open. d) description chars total 3782 over 11 agents (modest). e) refs to deleted files: ui-defaults.md:16 only.
- designer.md has no `tools:` key (pre-existing, not in order).

## Z1
- npm run lint: clean (exit 0).
- npm test: see final message; confirmed failures: skill-text.test.js:117 (stale regex), gen-readme-sections.test.js (README + architecture.html STALE: run `node plugins/devops/scripts/gen-readme-sections.mjs`), gen-module-type.test.js (same generator).
- CRLF suspicion: auto-agents SKILL tests pass now.

## Z1 final
npm test: 4 failed | 13458 passed | 2 skipped (549 files; 544 passed). Failures: skill-text.test.js:117, gen-readme-sections.test.js, gen-module-type.test.js (same generator), session-title.test.js "optional final check keeps green" (from #1181, run raced with the origin/main merge; re-run result in final message).
