import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// No YAML parser is a dependency of the plugin: the structure that matters is
// read from the indentation of the top-level blocks and the step text.
const text = readFileSync(fileURLToPath(new URL("../../../templates/tag-on-version.yml", import.meta.url)), "utf8");
const code = text.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

/** The indented body of a top-level `key:` block. */
function block(key) {
  const m = code.match(new RegExp(`^${key}:[^\n]*\n((?:[ \t]+[^\n]*\n|\n)*)`, "m"));
  return m ? m[1] : null;
}

describe("templates/tag-on-version.yml (#1212)", () => {
  test("triggers on a push to main", () => {
    expect(block("on")).toMatch(/^ {2}push:\n {4}branches: \[main\]/m);
  });

  test("the job may write contents (the tag) and nothing else", () => {
    expect(block("permissions").trim()).toBe("contents: write");
  });

  test("creates the tag only when it is missing", () => {
    expect(code).toMatch(/git ls-remote --exit-code --tags origin[^\n]*\n\s*then|if git ls-remote --exit-code --tags origin/);
    const guard = code.indexOf("git ls-remote --exit-code --tags");
    expect(guard).toBeGreaterThan(-1);
    expect(code.indexOf("exit 0", guard)).toBeLessThan(code.indexOf("git tag -a", guard));
    expect(code).toMatch(/git push origin "refs\/tags\/\$\{TAG\}"/);
  });

  test("offers a tag-prefix and documents the GITHUB_TOKEN limit", () => {
    expect(code).toMatch(/tag-prefix:/);
    expect(code).toMatch(/TAG_PREFIX/);
    expect(text).toMatch(/GITHUB_TOKEN[^\n]*does NOT trigger other\s+# workflows/);
  });
});
