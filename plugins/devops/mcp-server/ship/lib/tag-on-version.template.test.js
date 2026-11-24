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

  test("creates the tag only when it is missing; a failed check is not a missing tag", () => {
    const guard = code.indexOf("git ls-remote --exit-code --tags");
    expect(guard).toBeGreaterThan(-1);
    expect(code.indexOf("exit 0", guard)).toBeLessThan(code.indexOf("git tag -a", guard));
    // exit 2 = no match; any other status must stop before tagging
    expect(code).toMatch(/"\$STATUS" -ne 2\s*\]; then\s*\n[^\n]*::error::[^\n]*\n\s*exit 1/);
    expect(code.indexOf('-ne 2')).toBeLessThan(code.indexOf("git tag -a"));
    expect(code).toMatch(/git push origin "refs\/tags\/\$\{TAG\}"/);
  });

  test("the prefix is a literal in the file, not a workflow input (push has no inputs)", () => {
    expect(code).not.toMatch(/inputs\./);
    expect(code).toMatch(/^ {2}TAG_PREFIX: ""$/m);
    expect(code).toMatch(/^ {2}VERSION_FILE: "package\.json"$/m);
  });

  test("version and prefix are validated before use", () => {
    expect(code).toMatch(/grep -Eq '\^\[0-9\]\+\\.\[0-9\]\+\\.\[0-9\]\+\$'/);
    expect(code).toMatch(/grep -Eq '\^\(\[a-z\]\+\/\)\?\$'/);
    expect(code.indexOf("TAG_PREFIX must be")).toBeLessThan(code.indexOf('TAG="'));
  });

  test("no ${{ }} expression is interpolated into a shell script; values come through env", () => {
    const runs = [...code.matchAll(/run: \|\n((?: {10}[^\n]*\n|\n)+)/g)].map((m) => m[1]);
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) expect(r).not.toMatch(/\$\{\{/);
    expect(code).toMatch(/env:\n\s+VERSION: \$\{\{ steps\.version\.outputs\.version \}\}/);
  });

  test("runs for main only, also on a manual dispatch", () => {
    expect(code).toMatch(/if: github\.ref == 'refs\/heads\/main'/);
  });

  test("the tag message carries the channel", () => {
    expect(code).toMatch(/-m "\{\\"version\\":\\"\$\{VERSION\}\\",\\"channel\\":\\"\$\{CHANNEL\}\\"\}"/);
    expect(code).toMatch(/CHANNEL="\$\{CHANNEL:-stable\}"/);
  });

  test("documents the GITHUB_TOKEN limit", () => {
    expect(text).toMatch(/GITHUB_TOKEN[^\n]*does NOT trigger other\s+# workflows/);
  });
});
