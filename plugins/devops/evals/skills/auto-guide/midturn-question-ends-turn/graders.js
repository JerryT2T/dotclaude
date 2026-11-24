// #1188: a direct question arrives while a consent command is still running in
// a terminal. Expected: the turn ends with the answer as final text; no further
// blocking wait/poll call after it, and the answer is not left as interim text.
module.exports = (g) => ({
  "answers-in-final-text": g.finalTextMatches(/Service-Account|service account|Konto|account/i),
  "no-blocking-wait-after-answer": (ctx) => {
    const calls = ctx.parsed.toolCalls.filter((c) => !c.subagent);
    return !calls.some((c) => /read_terminal|sleep\s+\d{2,}|Start-Sleep/.test(c.name + " " + JSON.stringify(c.input || {})));
  },
});
