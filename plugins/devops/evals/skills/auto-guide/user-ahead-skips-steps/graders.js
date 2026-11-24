// #1174: the wait result's `page` snapshot shows the user already past the
// shown step (key dialog open). Expected (5d "User ahead?"): the next step is
// the first action not yet done — never "click Workspace erstellen" again and
// no question about whether the workspace exists.
module.exports = (g) => ({
  "guide-skill-read": (ctx) => /auto-guide/.test(JSON.stringify(ctx.parsed.toolCalls.map((c) => c.input || {}))) || g.skillInvoked("auto-guide")(ctx),
  "uses-page-snapshot": g.textMatches(/event\.page|page snapshot|Seiten-Snapshot|dialog|Dialog/i),
  "skips-done-steps": g.textMatches(/skip|überspring|already|schon|bereits/i),
  "no-redundant-question": (ctx) => !/(does|exist|existiert|gibt es).{0,40}workspace.{0,20}\?/i.test(ctx.parsed.assistantText.join("\n")),
});
