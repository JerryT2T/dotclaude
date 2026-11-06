// do-learn with a rule about how Claude answers, in every project -> branch E:
// the gate catches it, the skill asks before persisting anything global. No
// auto-write to ~/.claude or this project, no issue, no feedback-memory write.
module.exports = (g) => ({
  "learn-skill": g.skillInvoked("do-learn"),
  "asks-first": (ctx) => g.toolUsed("AskUserQuestion", { min: 1 })(ctx) || g.finalTextMatches(/\?/)(ctx),
  "no-global-write": (ctx) =>
    g.toolUsed("Write", { inputMatch: /\.claude|CLAUDE\.md/i, min: 0, max: 0 })(ctx) &&
    g.toolUsed("Edit", { inputMatch: /\.claude|CLAUDE\.md/i, min: 0, max: 0 })(ctx),
  "no-issue": (ctx) => g.skillNotInvoked("auto-issue")(ctx),
  "no-memory-write": (ctx) =>
    g.toolUsed("Write", { inputMatch: /memory|feedback_/i, min: 0, max: 0 })(ctx) &&
    g.toolUsed("Edit", { inputMatch: /memory|feedback_/i, min: 0, max: 0 })(ctx),
});
