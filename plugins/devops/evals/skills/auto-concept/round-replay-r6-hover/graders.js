// REPLAY of a real concept round (docs/concepts/20261030-1850-analyse-redesign,
// round 6). The user asked for a right-side table of contents that never
// overlaps the engine's ☰/💬 FABs (more dots on a line of the same length, plus
// a 7 topics x 7 questions maximum example), whose hover always lands on a
// navigation item (no dead gaps) and shows a pointer cursor, not a text cursor.
// The session of the time wrote rounds 7 and 8 without ever measuring the hover
// state — the user had to repeat the overlap complaint ("das was man gerade im
// hover hat überlappend, das geht gar nicht") and the cursor/label again.
//
// Expected with a skill that makes the author MEASURE interaction states: the
// run opens its own page (jsdom / headless Edge via node), hovers the TOC, and
// the built round 7 passes the browser checks below.
//
// Graders:
// - base ones from round-graders.js (round 6 baked, round 7 written + built).
// - state-check-ran (process): a measuring call exists, main or subagent — a
//   Bash call (node/browser) or a written .js/.mjs/.cjs script whose input holds
//   an interaction-state probe (dispatchEvent(, mouseover, mouseenter,
//   elementFromPoint, getBoundingClientRect, getComputedStyle, .hover(,
//   mouse.move, "hover" next to a node/Edge call). Rest-state screenshots
//   alone do not count.
// - toc-max-example-7x7 (outcome): a rail with >= 49 items exists (the 7x7 maximum).
// - toc-no-fab-overlap-on-hover / toc-cursor-pointer / toc-hover-no-dead-gap
//   (outcome): check-toc.js opens the BUILT page in headless system Edge via
//   playwright-core, takes the live round and measures every TOC rail with a
//   real mouse (see the header there). null = n/a when playwright-core or Edge
//   is missing, or the page was never built.
// - brief-verbatim: when round 7 went to concept-author, the brief quotes the
//   user's round-6 wording.
const path = require("path");
const { spawnSync } = require("child_process");
const { forName } = require("../round-graders.js");

const R = forName("20261030-1850-analyse-redesign", 6);

const PROBE_RE = /dispatchEvent\(|mouseover|mouseenter|elementFromPoint|getBoundingClientRect|getComputedStyle|\.hover\(|mouse\.move|:hover[^{]*\bmatches\b|\bhover\b.*\b(?:node|msedge|chrome)\b|\b(?:node|msedge|chrome)\b.*\bhover\b/i;
const SCRIPT_FILE_RE = /\.(?:m|c)?js$/i;

const stateCheckRan = (ctx) => ctx.parsed.toolCalls.some((c) => {
  const input = c.input || {};
  if (c.name === "Bash") return PROBE_RE.test(String(input.command || ""));
  if ((c.name === "Write" || c.name === "Edit") && SCRIPT_FILE_RE.test(String(input.file_path || ""))) {
    return PROBE_RE.test(String(input.content || input.new_string || ""));
  }
  return false;
});

// One browser run per built page (three graders share it).
const cache = new Map();
function browserCheck(ctx) {
  const html = R.builtPage(ctx.workdir);
  if (!html) return null;
  if (cache.has(html)) return cache.get(html);
  const r = spawnSync(process.execPath, [path.join(__dirname, "check-toc.js"), html], { encoding: "utf8", timeout: 600000, windowsHide: true });
  let res = null;
  try { res = JSON.parse(String(r.stdout || "").trim().split("\n").pop()); } catch { /* res stays null */ }
  if (res && (res.unavailable || res.error)) res = null;
  cache.set(html, res);
  return res;
}
// No rail at all counts as a fail: the user asked for a table of contents.
const outcome = (pick) => (ctx) => {
  const res = browserCheck(ctx);
  if (!res) return null;
  return res.rails > 0 && pick(res).length === 0;
};

module.exports = (g) => ({
  ...R.base(g),
  "state-check-ran": stateCheckRan,
  "toc-no-fab-overlap-on-hover": outcome((r) => r.overlap),
  "toc-cursor-pointer": outcome((r) => r.cursor),
  "toc-hover-no-dead-gap": outcome((r) => r.gaps),
  // The 7x7 maximum example the user asked for in round 6: a rail with the full
  // load (1 + 7 topics x (1 + 7 questions) + 1 = 58 items; >= 49 = 7x7 questions
  // alone) must be on a screen, so the other three checks run on the real worst
  // case instead of a 10-dot toy.
  "toc-max-example-7x7": (ctx) => { const res = browserCheck(ctx); return res ? res.maxItems >= 49 : null; },
  "brief-verbatim": R.briefVerbatim(["fab elemente", "7x7", "zwischenraum", "input cursor"]),
});

module.exports.browserCheck = browserCheck;
