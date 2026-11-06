// #1049 family (session title in the wrong state): a turn that a message from
// another Claude session starts is no new user work. It must not put the
// working head (⏳ ➜ 🤖 Solo ┃) on the session title, and it answers the question.
module.exports = (g) => ({
  "title-not-reset-to-solo": g.toolUsed(/set_session_title$/, { inputMatch: /⏳|Solo/, min: 0, max: 0 }),
  "no-title-prefix-written": g.toolUsed(/set_session_title$/, { min: 0, max: 0 }),
  "answered-read-only": (ctx) =>
    g.finalTextMatches(/eval\/work/)(ctx) &&
    g.toolUsed("Write", { min: 0, max: 0 })(ctx) &&
    g.toolUsed("Edit", { min: 0, max: 0 })(ctx),
});
