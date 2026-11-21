# Implement brief — Agent-Einsatz-Audit (round 1, action implement)

Decisions file: `../../20261121-1156-agent-einsatz-audit-decisions.json` (raw payload: round 1).
Concept page: `docs/concepts/20261121-1156-agent-einsatz-audit.html`, round fragment `rounds/01.html`
(each decision's finding, options and example live there — read the section of the decision you own).

Repos:
- **dotclaude** (this worktree, `P:\Projects\dotclaude\.claude\worktrees\distracted-gates-f75554`, branch `claude/agent-deployment-quality-403976`) — plugin source, `plugins/devops/`.
- **Star-Citizen-Companion-Web** (`P:\Projects\Star-Citizen-Companion-Web`, primary on `main` — never edit the primary; create a worktree + branch `chore/routine-agent-rules` off `origin/main`, commit there, push, open a PR, do NOT merge).

## User decisions, verbatim (round 1)

| Decision | User's answer (quoted option label / note) | Recommendation was |
|---|---|---|
| d-readonly — Welcher Agent übernimmt Lese-Aufgaben mit Urteil? | „Neuen Lese-Agent „analyst“ anlegen“ | scout auf sonnet |
| d-domain — Wie geht es mit den Domänen-Implementierern weiter? | „Alle drei zu einem Agent „builder“ zusammenlegen“ | core+frontend behalten, aix in core |
| d-fork — Soll die Policy Forks als eigenen Weg nennen? | „Fork nehmen, wenn die Aufgabe das Gespräch braucht“ | same |
| d-gate — Wann soll das API-Gate einen Spawn direkt durchlassen? | „Durchlassen, wenn der Auftrag Shell-Befehle braucht“ + „Pro Nachricht höchstens einen Spawn abweisen“ | same |
| d-pin — Soll der Backlog-Ablauf Typ und Modell der Triage festschreiben? | „Typ und Modell fest eintragen“ | same |
| d-gp — Wann darf Claude general-purpose nehmen? | „Nur wenn kein devops-Typ passt, mit Grund in der Beschreibung“ | same |
| d-opus — Modell der SCC-Feedback-Worker | „Keine passt“ — note: „opus mittel und bei komplex angeklickt opus hoch! und den rest dnach den gleichen regeln wie als würd e die nachricht im normalen chat mit devops kommen, sprich agenteneinsätze, concepte erstellen usw...“ | sonnet |
| d-report — Wie stellen wir sicher, dass jeder Agent mit seinem Bericht endet? | „Pflichtsatz in jedem Agent: die letzte Nachricht ist der Bericht“ + „Stopp-Hook schickt Agents mit Bericht unter 30 Wörtern zurück“ | same |
| d-limit — Wie viele Wörter darf ein qax-Bericht höchstens haben? | 400 Wörter | 400 |

## Checklist (one line per accepted item, each with its source quote)

### A · analyst — „Neuen Lese-Agent „analyst“ anlegen“
- [ ] A1 New `plugins/devops/agents/analyst.md`: read-only agent for reading tasks that need judgment — issue triage (ready / needs-decision / oversized / already-fixed), diagnose-only orders (root cause with file:line, no edits), branch/content triage, cause analysis. `model: sonnet`. Tools: Read, Grep, Glob, Bash (read-only use: `gh … view`, `git log/diff/merge-tree`, test runs allowed; no writes), WebFetch. FULL frontmatter format like the existing agents (name, description with `<example>`, model, color, tools) — the Desktop app shows an empty card otherwise. Description routes ONE job and stays short; detail in the body. Body: classification vocabulary, report format (verdict first, file:line evidence, plan, acceptance criteria), "you never edit". Quote: „Neuen Lese-Agent „analyst“ anlegen“.
- [ ] A2 Delegation policy names analyst: `deep-knowledge/agent-proactivity.md` tier table + spawn shape, `agent-proactivity-details.md`, `agent-orchestration.md`: reading task WITH a verdict (triage, diagnose, cause analysis) → `devops:analyst` (sonnet); pure locating stays `devops:scout` (haiku). Diagnose-only orders never go to an implementer. Quote: „Neuen Lese-Agent „analyst“ anlegen“.
- [ ] A3 Every list/registry/test of agent names includes analyst (e.g. `agents/agent-names.test.js`, agent card rendering, model audit, README agent table, CONVENTIONS). Quote: same.

### B · builder — „Alle drei zu einem Agent „builder“ zusammenlegen“
- [ ] B1 New `plugins/devops/agents/builder.md` = the merged implementer: union of `core.md`, `frontend.md`, `aix.md` (backend/services/data/infra, UI/templates/styling incl. browser verification tools, AI/LLM integration). `model: sonnet`. Tools = union (incl. the browser MCP tools of frontend and WebSearch/WebFetch of aix). Full frontmatter format. Description: implementer; spawned proactively only for parallel waves on disjoint files or by auto-agents. Quote: „Alle drei zu einem Agent „builder“ zusammenlegen“.
- [ ] B2 Delete `agents/core.md`, `agents/frontend.md`, `agents/aix.md`. Quote: same.
- [ ] B3 Sweep EVERY reference to `devops:core`, `devops:frontend`, `devops:aix` (and table rows / prose naming them as agent types) across `plugins/devops/` (skills incl. auto-agents/do-run/auto-concept/auto-polish/auto-harden, deep-knowledge, hooks, mcp-server, templates, evals, tests, README, CONVENTIONS, features) → `devops:builder`. "core + frontend in parallel" becomes "two builders on disjoint files". Do not touch CHANGELOG history entries. `grep -rn "devops:\(core\|frontend\|aix\)" plugins/` must end empty (except CHANGELOG). Quote: same.
- [ ] B4 Code that maps agent types (agent card, model/tier audit, delegation hooks, `[agent-model]` markers, budget downgrade logic, tests) works with `builder`/`analyst` and no longer expects core/frontend/aix; `npm test` + `npm run lint` green. Quote: same.
- [ ] B5 SCC routine prompt `docs/routine/tasks/scc-feedback-headless/SKILL.md` STEP 3 (line ~57, ~60): `subagent_type` → `devops:builder` (sub-agents for a second area → another `devops:builder`). Quote: same.

### C · Forks — „Fork nehmen, wenn die Aufgabe das Gespräch braucht“
- [ ] C1 Policy (`agent-proactivity.md`, details) gets a short rule: a task that needs THIS conversation (analysis of the discussion, a change resting on many earlier decisions) → `subagent_type: "fork"`; a fork keeps the session's model, so never use it for a cheaper-model run; a fresh context + own model/tools → a named agent. Quote: „Fork nehmen, wenn die Aufgabe das Gespräch braucht“.
- [ ] C2 Every hook that refuses a spawn without `model` (spawn-shape / agent-model gate) lets `subagent_type: "fork"` through without `model`; test for it. Quote: same.

### D · API gate — „Durchlassen, wenn der Auftrag Shell-Befehle braucht“ + „Pro Nachricht höchstens einen Spawn abweisen“
- [ ] D1 `hooks/lib/agent-apicredit-gate.js`: a spawn whose prompt needs shell commands (e.g. `gh `, `git `, `npm `, `npx `, `node `, `curl `, `python`, `pwsh`, a fenced bash block, "run the tests") is NOT refused — the API agent only reads files. Tests. Quote: „Durchlassen, wenn der Auftrag Shell-Befehle braucht“.
- [ ] D2 Several gated spawns in ONE assistant message: at most one refusal for that message; the others pass. Tests. Doc `deep-knowledge/api-credits.md` updated. Quote: „Pro Nachricht höchstens einen Spawn abweisen“.

### E · Pin triage — „Typ und Modell fest eintragen“
- [ ] E1 `skills/do-run/modes/backlog.md` Step 2.1 Pre-triage names `devops:analyst` with `model: "sonnet"` (instead of "one lightweight analysis agent"). Other triage spots (auto-cleanup branch triage, etc.) that spawn a reading agent with a verdict also name analyst. Quote: „Typ und Modell fest eintragen“.

### F · general-purpose — „Nur wenn kein devops-Typ passt, mit Grund in der Beschreibung“
- [ ] F1 Policy rule: `general-purpose` (and `Explore`) only when no devops type fits; the spawn's `description` then ends with the reason, e.g. `… (general-purpose: needs Write outside repo)`. Quote: „Nur wenn kein devops-Typ passt, mit Grund in der Beschreibung“.

### G · SCC routine — note on d-opus
Quote: „opus mittel und bei komplex angeklickt opus hoch! und den rest dnach den gleichen regeln wie als würd e die nachricht im normalen chat mit devops kommen, sprich agenteneinsätze, concepte erstellen usw...“
- [ ] G1 Workers: `model: opus`, effort `medium` (inherited). An item with `complex=true` (the admin's "komplex" toggle) → `effort: "high"` (one step, not `xhigh`). Update SKILL.md line ~41 ("two effort steps above") and line ~58-60, and the comment in `scripts/routine-watcher.mjs` ~line 52. The run itself stays opus/medium.
- [ ] G2 Everything else in the run follows the normal devops rules as if the message came in a normal chat: agent choice per the delegation policy (analyst for diagnose/triage, builder for implementation, qax/redteam lenses, research), concept pages where devops would make one, etc. Write this as one explicit rule in SKILL.md STEP 3 instead of hard-coded per-item agent lists — only the headless constraints (no questions, one PR per item, time box, ship rules) stay routine-specific. Keep the existing "diagnose only" contract for machine items but name `devops:analyst` for it.
- [ ] G3 Commit in an SCC worktree on branch `chore/routine-agent-rules` off origin/main, push, open a PR (title per SCC conventions), do not merge. Note: the live prompt copy `~/.claude/scheduled-tasks/scc-feedback-headless/SKILL.md` is synced from the repo by the watcher — check how (`LIVE_PROMPT` / `REPO_PROMPT` in routine-watcher.mjs) and say in the report whether merge is enough.

### H · Report discipline — „Pflichtsatz in jedem Agent: die letzte Nachricht ist der Bericht“ + „Stopp-Hook schickt Agents mit Bericht unter 30 Wörtern zurück“
- [ ] H1 Every agent body in `plugins/devops/agents/*.md` carries the rule: your final message IS the report to the caller — within the requested length, never a status line or a reply to a late background notification; write it last. Quote: „Pflichtsatz in jedem Agent: die letzte Nachricht ist der Bericht“.
- [ ] H2 A `SubagentStop` hook (plugin hooks registration per `plugins/devops/CONVENTIONS.md`): for a devops agent whose last assistant text has < 30 words, block once with a reason asking it to write its report now (respect `stop_hook_active` → never loop; never block a second time). Tests incl. the loop guard. Quote: „Stopp-Hook schickt Agents mit Bericht unter 30 Wörtern zurück“.

### I · qax length — slider 400
- [ ] I1 `agents/qax.md`: final report ≤ 400 words; long evidence goes into a file the report links. Quote: „400 Wörter“.

### Z · Verification
- [ ] Z1 `npm test` and `npm run lint` green in dotclaude.
- [ ] Z2 Independent `devops:qax` (built nothing) checks every line above against the diff, quote → observed → verdict.

Acceptance table per agent: one row per owned line: item → done / partial / not done → evidence (file:line, test). A line without evidence counts as not done.
