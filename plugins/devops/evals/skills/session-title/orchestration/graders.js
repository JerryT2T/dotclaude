// Orchestration parent: ⏳ ➜ 🤖 Team with a count while sessions run, then
// 👉 Ready "integrieren und shippen?" once all are delivered.
module.exports = (g) => ({
  "team-title": g.traceMatches(/⏳\s*➜\s*🤖\s*Team/),
  "team-count": g.traceMatches(/2 von 4/),
  "ready-integrate": g.traceMatches(/integrieren und shippen\?/),
  "no-ship-tools": g.toolUsed(/dotclaude(?:-ship)?__ship_/, { min: 0, max: 0 }),
});
