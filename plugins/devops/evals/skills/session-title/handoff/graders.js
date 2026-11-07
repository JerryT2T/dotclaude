// Parent after a marked handoff: ⏳ ➜ 🔗 Linked title, no ship button, and
// no Released title while the last linked side session still runs.
module.exports = (g) => ({
  "linked-title": g.traceMatches(/⏳\s*➜\s*🔗\s*Linked/),
  "no-released-early": (ctx) => !/🟩[^\n]{0,20}Released/.test(JSON.stringify(ctx.parsed.toolCalls.filter((c) => !c.subagent && /set_session_title|render_completion_card/.test(c.name)))),
  "no-ship-button": (ctx) => !/"(ship|Ship)"|Shippen\?/.test(JSON.stringify(ctx.parsed.toolCalls.filter((c) => /render_completion_card/.test(c.name)))),
  "no-ship-tools": g.toolUsed(/dotclaude(?:-ship)?__ship_/, { min: 0, max: 0 }),
});
