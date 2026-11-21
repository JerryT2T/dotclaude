// auto-agents with a stubbed governor state (pressure.priority: ["cpu"]) and a
// task naming a quiet window ("heavy work only after 02:00") that has not
// started, on a three-domain feature that would normally fan out. Expected:
// at most one implementing agent before the window, a brief with
// touched-file tests only (no full-suite command), and no command that raises
// a process priority. The model may also stop at the plan; the graders only
// forbid the wide/heavy/priority-raising shapes.
const IMPL = /^devops:(builder|feature)$/;
const brief = (c) => JSON.stringify(c.input || {});
const FULL_SUITE = /\b(npm (run )?test(?!:)|npx vitest run(?!\s+\S)|dotnet test|pytest(?!\s+\S)|cargo test|full (test )?suite|alle tests)\b/i;
const RAISE = /\.PriorityClass\s*=|setpriority|\brenice\b|Start-Process[^\n]*-?Priority|\bnice\s+-n\s+-/i;
module.exports = (g) => ({
  "agents-skill": g.skillInvoked("auto-agents"),
  "one-implementer-at-most": g.agentSpawned(IMPL, { min: 0, max: 1 }),
  "no-full-suite-in-brief": (ctx) => !ctx.parsed.toolCalls.filter((c) => !c.subagent && (c.name === "Agent" || c.name === "Task")
    && IMPL.test((c.input || {}).subagent_type || "")).some((c) => FULL_SUITE.test(brief(c)) && !/touched|only the tests of|nur die tests/i.test(brief(c))),
  "targeted-tests-in-brief": (ctx) => {
    const agents = ctx.parsed.toolCalls.filter((c) => !c.subagent && (c.name === "Agent" || c.name === "Task") && IMPL.test((c.input || {}).subagent_type || ""));
    return agents.every((c) => /touched|only the tests of|targeted/i.test(brief(c)));
  },
  "no-priority-raise": g.toolUsed("Bash", { inputMatch: RAISE, min: 0, max: 0 }),
  "governor-state-read": g.traceMatches(/governor[\\/]+state\.json/),
});
