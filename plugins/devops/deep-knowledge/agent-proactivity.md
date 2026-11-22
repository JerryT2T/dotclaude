# Agent Delegation Policy

Always-on (SessionStart). This plugin instruction **is** the standing request
to use the Agent tool for the devops role agents — no user prompt must ask.
Classify every task by the tiers below before the first tool call, by signal.

## Tiers

| Tier | Signal | Do |
|------|--------|----|
| **Inline** | 1 domain, Q&A, quick fix, or an answer reachable by reading ~5 files or fewer | No agent — a sub-agent pays a full context bootstrap and loses the conversation. |
| **1 agent, background** | A *conclusion* whose path would flood the conversation: open web research — searches, several sources to weigh (`research`; a few fetches of pages the task names stay inline), a sweep over >~10 files (`scout`), a full test suite or build (`qax`), a high-stakes plan or diff (`redteam`), a real-stakes trade-off no file answers (`pox`) | `run_in_background: true`; keep working inline; relay the conclusion, not the transcript. |
| **2–3 agents, parallel** | Two *analysis* lenses on one question (`research` + `pox`, `pox` + `redteam`) | One message, ~5–15 tool calls each. **Implementing** agents in parallel are never auto-spawned: offer it in one sentence. A UI consuming a new endpoint is not independent: Inline if ~5 files or fewer, else Full ceremony. |
| **Full ceremony** | 3+ domains, a feature end-to-end, or a high-risk change (migration, auth, breaking contract, destructive op) | Never auto-start. Offer in one sentence, no slash name; on a yes invoke the auto-agents skill (do-run if the user will be away). |

Implementing skills (do-run, auto-concept implement, auto-fix, auto-harden,
auto-polish) execute through the auto-agents skill; Inline needs no skill load.

**Spawn shape, every Agent call:** `subagent_type` + `model` (`haiku`|`sonnet`|
`opus`, never a pinned version), even if it equals the session's — without
`model` the first spawn is refused. Locating → `devops:scout` (haiku, only
there), not `Explore`. Reading WITH a verdict (triage, diagnose-only, cause
analysis) → `devops:analyst` (sonnet); a diagnose-only order never goes to an
implementer. Implementing → `devops:builder` on `sonnet`; opus only for
design-heavy/ambiguous work in class `free`. Parallel implementers = two
builders on disjoint files. A task that needs THIS conversation →
`subagent_type: "fork"` (inherits conversation + cache, keeps the session
model, no `model` field; never for a cheaper-model run); fresh context + own
model/tools → a named agent. `general-purpose`/`Explore` only when no devops
type fits; the `description` then ends with the reason, e.g. `… (general-purpose:
needs Write outside repo)`. With api-credit on, a first `scout`/`research`/`redteam` spawn is refused once: run `claude-api-agent.js` first.

**Card:** the agent card (`pre.agent.announce`) is your very next text,
verbatim, before any other tool call, also under Quiet; parallel spawns → last
card only.

## Precedence: explicit run skill > hard stop > hard go > switch > escalation > tier table

- **Explicit run skill** — inside `/do-run burn` and auto-agents after a ceremony
  yes the invocation is the answer: no budget question, no budget downgrade.
  Every other do-run mode runs under the class (§ Budget).
- **Hard stop** — "just", "quick", "inline", "no agents" (de: "nur X",
  "schnell", "keine Agents") → Inline; a high-risk change still gets its
  inline pre-mortem (`pre-mortem.md`).
- **Hard go** — "agents", "mit Agents", "full", "komplett durchziehen" →
  spawn as designed, no budget question.
- **Switch** — the `[delegation] mode` line (`.claude/delegation.json`
  `{"mode":"auto"|"ask"|"off"}`): `ask` → every tier above Inline is offered
  in one sentence; `off` → Inline always. Both cap only *proactive* spawns.
- **Escalation** — same area iterated 2+ times without converging → one tier up.
- Never spawn for an explanation or a single-fact lookup; never silently.
  `redteam` only after the inline pre-mortem hits a higher-stakes trigger; max 2 rounds per diff.

**Budget.** The newest `[budget]` line is the class (`free` / `ask-before-parallel`
/ `sonnet-only`) and outranks any earlier usage claim; never put usage numbers
into skill args or agent prompts from memory. Class other than `free` → before a
parallel spawn or ceremony read `agent-proactivity-details.md` § Budget (the
once-per-session question and its three options).

**Claude Projects thread** (wake note / hearthbot tools): subagents yes, `start_session` side sessions no (report the split to the coordinator); the budget question is never asked, the class applies silently (`agent-proactivity-details.md` § Thread).

**Web hand-offs.** Next step = "user, go to `<site>` and do X" (marketplace, API
key, OAuth, account, terms, cron-job.org) → start `auto-guide` first, never a
step list (#519, #617). More: `agent-proactivity-details.md`, `agent-orchestration.md`.
