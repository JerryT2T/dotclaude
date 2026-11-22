import { describe, test, expect } from "vitest";
import { mkdtempSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitSegments } from "./ship-guard-match.js";

describe("gitSegments — shell wrappers and here-docs", () => {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), "sgw-")));
  const repo = join(base, "repo");
  mkdirSync(repo);
  const texts = (cmd) => gitSegments(cmd, base).map((s) => s.text.trim());
  const dirs = (cmd) => gitSegments(cmd, base).map((s) => s.dir);

  test.each([
    ['bash -c "git commit -m x"'],
    ["sh -c 'git commit -m x'"],
    ['bash -lc "git commit -m x"'],
    ['bash -ec "git commit -m x"'],
    ['zsh -c "git commit -m x"'],
    ['/bin/bash -c "git commit -m x"'],
    ['sudo bash -c "git commit -m x"'],
    ["cmd /c git commit -m x"],
    ['cmd.exe /c "git commit -m x"'],
    ['pwsh -c "git commit -m x"'],
    ['powershell -Command "git commit -m x"'],
    ["bash <<'EOF'\ngit commit -m x\nEOF"],
    ["bash -s <<EOF\ngit commit -m x\nEOF"],
    ["sh <<-EOF\n\tgit commit -m x\n\tEOF"],
    ["bash -c \"sh -c 'git commit -m x'\""],
    ['bash -c "sh -c \\"bash -c \'git commit -m x\'\\""'],
  ])("%j yields the inner git call", (cmd) => {
    expect(texts(cmd).some((t) => /^git commit/.test(t))).toBe(true);
  });

  test("a fourth level is not followed (depth cap 3)", () => {
    const nest = (levels) => {
      const tags = ["A", "B", "C", "D"].slice(0, levels);
      return tags.map((t) => `bash <<'${t}'`).join("\n") + "\ngit commit -m x\n" + [...tags].reverse().join("\n");
    };
    expect(texts(nest(3)).some((t) => /^git commit/.test(t))).toBe(true);
    expect(texts(nest(4))).toEqual([]);
  });

  test.each([
    ['echo "git commit -m x"'],
    ['grep "git push" file'],
    ['git log --grep "bash -c git commit"'],
    ["cat > notes.txt <<'EOF'\ngit commit -m x\nEOF"],
    ["gh issue create --body \"$(cat <<'EOF'\ngit push\nEOF\n)\""],
    ["bash script.sh <<'EOF'\ngit commit -m x\nEOF"],
    ["bash -c 'echo hi' <<'EOF'\ngit commit -m x\nEOF"],
    ["bash -c 'echo git commit'"],
  ])("%j yields no git write", (cmd) => {
    expect(texts(cmd).some((t) => /^git (commit|push)/.test(t))).toBe(false);
  });

  test("a commit message that mentions a wrapper stays the one outer commit", () => {
    expect(texts(`git commit -m "bash -c 'git push'"`)).toHaveLength(1);
  });

  test("directory: the wrapper position and the inner cd, without leaking", () => {
    expect(dirs(`cd repo && bash -c "git commit -m x"`)).toEqual([repo]);
    expect(dirs(`bash -c "cd repo && git commit -m x"`)).toEqual([repo]);
    expect(dirs(`bash -c "cd repo" && git status`)).toEqual([base]);
    expect(dirs(`bash -c "cd repo; git status"; git commit -m x`)).toEqual([repo, base]);
  });
});
