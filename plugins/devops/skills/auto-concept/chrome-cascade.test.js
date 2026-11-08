import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Cascade rules jsdom cannot lay out, so they are pinned at the source.

const here = dirname(fileURLToPath(import.meta.url));
const css = (name) => readFileSync(join(here, "deep-knowledge", name), "utf8");

describe("own note layer against mock CSS", () => {
  const src = css("templates-design-overview-css-2.md");

  test("a mock's `.app > *` rule cannot pull the layer into the flow", () => {
    const rule = src.match(/^\.upin-layer \{[^}]*\}/m)?.[0] ?? "";
    expect(rule).toMatch(/position: absolute !important/);
    expect(rule).toMatch(/inset: 0 !important/);
    expect(rule).toMatch(/z-index: 30 !important/);
  });

  // #1080: a mock reset `:is([data-design], …) .bz :where(button,a)
  // { background:none; padding:0; box-shadow:none }` (0,2,0) stripped the pin
  // disc and the bubble summary's padding. Verified in a browser: without the
  // guard computed background/box-shadow = none, padding = 0; with it the
  // disc, glow and padding stay. `:not(#_)` adds id weight, no !important.
  test("pins and bubble summaries keep their look under a mock button reset", () => {
    const pin = src.match(/^\.upin-pin:not\(#_\) \{[^}]*\}/m)?.[0] ?? "";
    expect(pin).toMatch(/background: linear-gradient\(160deg, #ecd9ff, var\(--upin-color\)\)/);
    expect(pin).toMatch(/box-shadow: 0 0 0 4px/);
    expect(pin).toMatch(/padding: 0/);
    expect(pin).not.toMatch(/!important/);
    const anno = src.match(/^\.anno-pin:not\(#_\) \{[^}]*\}/m)?.[0] ?? "";
    expect(anno).toMatch(/background: linear-gradient/);
    expect(anno).toMatch(/font-size: 0/);
    expect(src).toMatch(/^\.anno-bubble-summary:not\(#_\) \{ padding: 0\.45rem 0\.7rem;/m);
    // The guard repeats the base look: base and guard must not drift apart.
    const base = src.match(/^\.upin-pin \{[^}]*\}/m)?.[0] ?? "";
    expect(base).toContain("background: linear-gradient(160deg, #ecd9ff, var(--upin-color))");
  });

  test("a saved own note shows its full text on hover and focus", () => {
    expect(src).toMatch(/\.upin-bubble:is\(:hover, :focus-within\) \.anno-bubble-question \{ white-space: normal;/);
  });

  test("the open editor still rises above the annotation layer", () => {
    expect(src).toMatch(/\.upin-layer:has\(\.upin\[data-editing="true"\]\) \{ z-index: 45 !important; \}/);
  });
});

describe("field mic", () => {
  test("a field inside a mock screen gets none; notes and answers inside a screen keep it", () => {
    expect(css("templates-voice-js.md")).toContain("if (f.closest('[data-screen]') && !f.closest('[data-anno-layer], .upin-editor')) return;");
  });
});

describe("analysis chat", () => {
  test("the content keeps a gap to the scrollbar", () => {
    expect(css("templates-analysis-css.md")).toMatch(/.an-chat {[^}]*padding-inline: 8px;/);
  });
});

describe("analysis view under the design chrome", () => {
  test("the backdrop runs while an analysis view is open, and the loop wakes for it", () => {
    const src = css("templates-utilities.md");
    expect(src).toContain('body[data-view-active="true"]:has(section[data-view-kind="analysis"][data-view-active="true"]) #neural-bg { display: block; }');
    expect(src).toContain("&& !(document.body.dataset.viewActive === 'true'");
    expect(src).toContain("new MutationObserver(kick).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-view-active'] })");
  });

  test("stages after the briefing keep the chrome's top reserve", () => {
    const src = css("templates-analysis-css.md");
    expect(src).toMatch(/section\[data-view\]\.an-enh:not\(\.an-lite\) \{ padding-top: var\(--chrome-safe-top, 5\.75rem\); \}/);
  });
});
