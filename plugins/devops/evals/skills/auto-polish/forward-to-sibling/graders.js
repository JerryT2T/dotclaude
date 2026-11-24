// auto-polish in a project thread: a structural finding owned by a sibling
// thread (named in the spawn note) is forwarded in the same turn, never put to
// the person as a decision, and the reply lists it as forwarded.
module.exports = (g) => ({
  "polish-ran": g.toolUsed("Skill", { inputMatch: /auto-polish/ }),
  "forwarded": g.toolUsed(/message_thread|message_coordinator|send_message|SendMessage/),
  "no-question": g.toolUsed("AskUserQuestion", { min: 0, max: 0 }),
  "reply-says-forwarded": g.textMatches(/weitergegeben|forwarded/i),
  "not-open-decision": (ctx) => !/needs your OK|braucht dein OK/i.test(ctx.parsed.finalText || ""),
});
