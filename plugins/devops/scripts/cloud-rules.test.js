import { describe, test, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cr = require("./cloud-rules.js");

const tmp = [];
function repo() {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cr-")));
  tmp.push(d);
  fs.mkdirSync(path.join(d, ".git"));
  return d;
}
afterEach(() => { while (tmp.length) fs.rmSync(tmp.pop(), { recursive: true, force: true }); });

describe("cloud-rules block", () => {
  test("the file stays within 40 lines and names what the rules file must carry", () => {
    const text = cr.applyBlock("");
    expect(text.trimEnd().split("\n").length).toBeLessThanOrEqual(cr.MAX_LINES);
    expect(text).toMatch(/Never work on `main`/);
    expect(text).toMatch(/<type>\(<scope>\): <subject>/);
    expect(text).toMatch(/CHANGELOG belong to the ship step/);
    expect(text).toMatch(/✨✨✨ <title> ✨✨✨/);
    expect(text).toMatch(/cannot push tags/);
  });

  test("the rules carry the one-line note for a Claude Project thread without the plugin, and only for that case", () => {
    const text = cr.applyBlock("");
    expect(text).toMatch(/## Claude Project thread without the devops plugin/);
    expect(text).toMatch(/no skill named `devops:…` is loaded/);
    expect(text).toMatch(/<wake …><project …>/);
    expect(text).toMatch(/not\s+active here/);
    expect(text).toMatch(/claude\.ai > Plugins/);
    expect(text).not.toMatch(/Project settings > Plugins/);
    expect(text).toMatch(/Anywhere else, say nothing/);
  });

  test("the rules ask a cloud thread to steer the project back to local threads, generic and cloud-only", () => {
    const text = cr.applyBlock("");
    expect(text).toMatch(/## Where a thread runs/);
    expect(text).toMatch(/CLAUDE_CODE_REMOTE=true/);
    expect(text).toMatch(/"Work locally" on a device that has this repo checked out/);
    expect(text).toMatch(/Do the work anyway/);
    // generic: no machine, user or path of the author leaks into a file every repo carries
    expect(text).not.toMatch(/[A-Z]:\\|\/Users\/|\/home\//);
  });

  test("the request is skipped where the project asked for the cloud, and the file still fits", () => {
    const text = cr.applyBlock("");
    expect(text).toMatch(/Skip the request \(keep the line\)/);
    expect(text).toMatch(/start in the cloud\s+or that the coordinator asks each time/);
    expect(text).not.toMatch(/## Cloud thread announces itself/);
    expect(text.trimEnd().split("\n").length).toBeLessThanOrEqual(cr.MAX_LINES);
  });

  test("applyBlock keeps outside text, replaces a stale block in place, drops a duplicate", () => {
    const stale = `intro\n\n${cr.BLOCK_START}\nold\n${cr.BLOCK_END}\n\nmine\n\n${cr.BLOCK_START}\nold2\n${cr.BLOCK_END}\n`;
    const out = cr.applyBlock(stale);
    expect(out.split(cr.BLOCK_START).length - 1).toBe(1);
    expect(out.startsWith("intro\n\n")).toBe(true);
    expect(out).toContain("\n\nmine\n");
    expect(out).not.toContain("old");
    expect(cr.applyBlock(out)).toBe(out);
  });

  test("checkText: missing / no-block / outdated / duplicate / ok", () => {
    expect(cr.checkText(null).issues).toEqual(["missing"]);
    expect(cr.checkText("own text\n").issues).toEqual(["no-block"]);
    expect(cr.checkText(`${cr.BLOCK_START}\nold\n${cr.BLOCK_END}\n`).issues).toEqual(["outdated"]);
    const ok = cr.applyBlock("");
    expect(cr.checkText(ok)).toEqual({ ok: true, issues: [] });
    expect(cr.checkText(ok + ok).issues).toContain("duplicate");
  });
});

describe("cloud-rules write / check", () => {
  test("creates .claude/rules/devops.md, then does not touch a current file (idempotent)", () => {
    const d = repo();
    expect(cr.check(d)).toMatchObject({ ok: false, issues: ["missing"] });
    const first = cr.write(d);
    expect(first).toMatchObject({ changed: true, created: true, rel: ".claude/rules/devops.md" });
    const file = path.join(d, ".claude", "rules", "devops.md");
    expect(fs.existsSync(file)).toBe(true);
    const before = fs.statSync(file).mtimeMs;
    const second = cr.write(path.join(d, ".claude"));
    expect(second).toMatchObject({ changed: false, created: false });
    expect(fs.statSync(file).mtimeMs).toBe(before);
    expect(cr.check(d).ok).toBe(true);
  });

  test("an existing file with the user's own text keeps it and gains the block; CRLF stays CRLF", () => {
    const d = repo();
    const file = path.join(d, ".claude", "rules", "devops.md");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "my own rule\r\n");
    const r = cr.write(d);
    expect(r).toMatchObject({ changed: true, created: false });
    const text = fs.readFileSync(file, "utf8");
    expect(text).toContain("my own rule\r\n");
    expect(text).toContain("\r\n");
    expect(text.replace(/\r\n/g, "\n")).toContain(cr.BLOCK_START);
    expect(cr.check(d).ok).toBe(true);
    expect(cr.write(d).changed).toBe(false);
  });

  test("outside a git work tree nothing is written", () => {
    const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cr-nogit-")));
    tmp.push(d);
    // a tmp dir has no .git up the tree on a normal machine; guard anyway
    if (cr.check(d).issues[0] !== "no-repo") return;
    expect(cr.write(d)).toMatchObject({ root: null, changed: false });
    expect(fs.existsSync(path.join(d, ".claude"))).toBe(false);
  });
});
