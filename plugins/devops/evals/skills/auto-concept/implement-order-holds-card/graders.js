// What this case is for: the hook, live. The brief orders a decision card, the
// session reaches for it, and no card may reach the person (the stub's own
// call log, see ../implement-click-starts-build/graders.js).
//
// Deliberately NOT graded: whether the round gets built. A brief that names
// this very situation and orders a card first is a standing instruction the
// session may side with; observed 2026-11-27, it then asked in a plain thread
// message and built nothing. The hook can hold a card back, it cannot make a
// session build. The build itself is graded where the brief only says
// "concept only": implement-click-starts-build.
const shared = require("../implement-click-starts-build/graders.js")();

module.exports = () => ({ "no-decision-card": shared["no-decision-card"] });
