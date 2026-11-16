import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { trailingFullSuite, containsFullSuite, unwrapFiltered } = require("./full-suite-cmd.js");
const { rewrite } = require("../pre-tool-use/pre.bash.output-filter.js");

const ROOT = "C:/Users/x/plugin root";

describe("a full-suite run stays one when the output filter wraps it", () => {
  test("what the filter hook writes is recognised as the run it wraps", () => {
    for (const cmd of ["npm test", "npx vitest run", "npm run test"]) {
      const wrapped = rewrite(cmd, ROOT);
      expect(wrapped, cmd).toContain("run-filtered.js");
      expect(unwrapFiltered(wrapped)).toBe(cmd);
      expect(trailingFullSuite(wrapped)).toEqual(trailingFullSuite(cmd));
      expect(trailingFullSuite(wrapped)).toEqual({ segment: cmd, cdTo: null });
      expect(containsFullSuite(wrapped)).toBe(true);
    }
  });

  test("a leading cd stays outside the wrapper and is still read", () => {
    const wrapped = rewrite("cd sub && npm test", ROOT);
    expect(trailingFullSuite(wrapped)).toEqual({ segment: "npm test", cdTo: "sub" });
  });

  test("a wrapped filtered run is still not a full suite", () => {
    const wrapped = rewrite("npx vitest run plugins/a.test.js", ROOT);
    expect(trailingFullSuite(wrapped)).toBeNull();
    expect(containsFullSuite(wrapped)).toBe(false);
  });

  test("unquoted and single-quoted runner paths unwrap too, other commands are untouched", () => {
    expect(unwrapFiltered("node /p/scripts/run-filtered.js -- npm test")).toBe("npm test");
    expect(unwrapFiltered("node '/p q/scripts/run-filtered.js' -- npm test")).toBe("npm test");
    expect(unwrapFiltered("node build.js -- npm test")).toBe("node build.js -- npm test");
  });
});
