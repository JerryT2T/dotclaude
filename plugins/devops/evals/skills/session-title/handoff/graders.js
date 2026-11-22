// Parent after a marked handoff: ⏳ ➜ 🔗 title (Linked), no ship button, and
// no Released title while the last linked side session still runs.
module.exports = (g) => ({
  "linked-title": g.traceMatches(/⏳\s*➜\s*🔗/u),
  "no-released-early": (ctx) => !/🟩[^\n]{0,20}Released|🟩\s*➜\s*🚀/u.test(JSON.stringify(ctx.parsed.toolCalls.filter((c) => !c.subagent && /set_session_title|render_completion_card/.test(c.name)))),
  "no-ship-button": (ctx) => !/"(ship|Ship)"|Shippen\?/.test(JSON.stringify(ctx.parsed.toolCalls.filter((c) => /render_completion_card/.test(c.name)))),
  "no-ship-tools": g.toolUsed(/dotclaude(?:-ship)?__ship_/, { min: 0, max: 0 }),
});
