# Interactive Mode — Engagement Rules

The rule block every agent spawned in interactive mode gets as its interaction directive, and that the orchestrator follows itself (split out of `agent-orchestration.md` § Interactive Mode — Engagement Rules).

The user chose interactive because they want to shape the work, not just receive
it. Default to involving them; silent execution is the exception. Their reason
for picking interactive is usually that the task has **2+ conceptual forks**
across the run OR one fork too large / multi-dimensional to settle textually —
otherwise they would have picked background. Match that expectation: even though
the operational floor below is "≥1 checkpoint per wave", a fully silent
orchestration is almost certainly wrong for interactive mode.

**Precedence rule — what counts as a checkpoint:**
Ask for **user-visible** decisions and **plan-shaping conceptual forks**
(architecture pattern, contract shape between waves, scope cuts, public naming,
strategy picks). Proceed **silently** on implementation details once the
shaping decisions are fixed (variable layout, internal helper names, file order,
library minor versions, code style choices already covered by conventions).

**Operational floor — at least one checkpoint per wave** (not per agent), unless
the wave is mechanically unambiguous (apply a known refactor pattern, fix an
explicit bug, run tests, mechanical rename). With multiple agents in one wave,
one shared checkpoint covers the wave — don't fan out the same question per
agent.

**Reporting silence:**
- **Sub-agent** — if you genuinely have no fork worth asking about, state that
  in your return / handoff: `"no conceptual forks — proceeded directly"`.
- **Orchestrator** — aggregate these signals into the wave summary so the user
  can see the silence was intentional, not laziness.

**Who asks:** Claude Code strips `AskUserQuestion` from every sub-agent. A
sub-agent that hits one of the forks below stops at it and returns it as
`open_questions` (options + the one it recommends); the **orchestrator** asks
the user via `AskUserQuestion` between waves — or before spawning the wave,
when the fork is already visible in the plan.

**Lightweight, in-chat decisions (one `AskUserQuestion` from the orchestrator):**
- Mode / strategy picks with 2–4 named alternatives
- Naming the user will see (commands, labels, public API names, file names exposed
  in UI)
- Trade-offs with a clear axis (speed vs. flexibility, strict vs. permissive,
  inline vs. extracted)
- Ambiguous requirements where one short clarification unblocks 30+ minutes of
  work
- Scope cuts (do X now, defer Y? include Z or skip?)

**Hand the decision back as a concept-page case instead when** (neither an
agent nor auto-agents opens a concept page itself — auto-agents invokes no
skill: the agent stops at the fork and returns it as an open decision, the
orchestrator ends the wave with `needs-decision`, and the calling skill opens
the page via auto-concept and re-enters auto-agents with the answer):
- 3+ design alternatives need side-by-side comparison with pros/cons
- A UI/UX layout decision benefits from a visual mockup (prototype template)
- An architecture or strategy choice has multi-dimensional trade-offs
  (decision template)
- Multiple related decisions cluster on the same topic — bundle them on one page
  rather than firing 3+ separate `AskUserQuestion` prompts
- The artefact would be hard to describe textually in <10 lines, or benefits from
  toggles/comments the user can leave on individual items
- Scenarios need to be sketched out (state A → action → state B) and compared

**Skip the question only when:**
- The answer is forced by the codebase, an existing convention, or the prompt
  itself
- The user already answered the same (or equivalent) question earlier in the
  session
- Asking would feel like nagging on a trivial choice (import order, internal
  helper name, file location inside an obvious folder)

**Phrasing rules:**
- Lead with your recommendation as the first option, labeled `(Recommended)`,
  followed by 1–3 alternatives
- Never ask open questions ("What do you think?", "How should we do this?") —
  always give choices
- Name the deciding facts and the trade-off next to the question — the
  evidence and the conclusion, never a replay of your thinking — and never
  decide silently
