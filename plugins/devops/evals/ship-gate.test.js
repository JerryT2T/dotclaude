import { test, expect, vi, afterEach } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const { parseArgs, changedSkills, selectCases, failuresIn, main } = require("./ship-gate.js");

const tmps = [];
afterEach(() => { vi.restoreAllMocks(); for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

function evalsRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-root-"));
  tmps.push(root);
  const mk = (id, tags) => {
    const d = path.join(root, id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "case.yaml"), `name: ${path.basename(id)}\n`);
    fs.writeFileSync(path.join(d, "prompt.md"), `---\ntags: [${tags}]\n---\n\nhi\n`);
  };
  mk("skills/do-learn/a", "skill-body, learned");
  mk("skills/do-learn/b", "skill-body");
  mk("skills/auto-fix/c", "learned");
  return root;
}

const SKILL_DIFF = () => ["plugins/devops/skills/do-learn/SKILL.md"];

test("changedSkills maps only skill folders", () => {
  expect(changedSkills(["plugins/devops/skills/do-learn/SKILL.md", "plugins/devops/skills/do-learn/deep-knowledge/x.md", "plugins/devops/hooks/a.js", "README.md"])).toEqual(["do-learn"]);
});

test("selectCases keeps learned cases of touched skills only", () => {
  expect(selectCases(["do-learn"], evalsRoot())).toEqual(["skills/do-learn/a"]);
});

test("nothing applies -> exit 0, no run", () => {
  const run = vi.fn();
  vi.spyOn(console, "log").mockImplementation(() => {});
  expect(main([], { changedFiles: () => ["docs/x.md"], root: evalsRoot(), runCases: run })).toBe(0);
  expect(run).not.toHaveBeenCalled();
});

test("--dry-run prints the selection and runs nothing", () => {
  const run = vi.fn();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  expect(main(["--dry-run"], { changedFiles: SKILL_DIFF, root: evalsRoot(), runCases: run })).toBe(0);
  expect(run).not.toHaveBeenCalled();
  expect(log.mock.calls[0][0]).toContain("skills/do-learn/a");
});

test("a failure that passes on its rerun exits 0", () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const run = vi.fn().mockReturnValueOnce(new Map([["skills/do-learn/a", ["g"]]])).mockReturnValueOnce(new Map());
  expect(main(["--out", os.tmpdir()], { changedFiles: SKILL_DIFF, root: evalsRoot(), runCases: run })).toBe(0);
  expect(run).toHaveBeenCalledTimes(2);
});

test("a case failing twice -> exit 1 with one line per case", () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const run = vi.fn().mockReturnValue(new Map([["skills/do-learn/a", ["rule-in-project"]]]));
  expect(main(["--out", os.tmpdir()], { changedFiles: SKILL_DIFF, root: evalsRoot(), runCases: run })).toBe(1);
  expect(err).toHaveBeenCalledTimes(1);
  expect(err.mock.calls[0][0]).toContain("skills/do-learn/a");
});

test("null grades never count as failures", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-res-"));
  tmps.push(dir);
  fs.writeFileSync(path.join(dir, "r.json"), JSON.stringify({ case: "x", grades: { a: null, b: true } }));
  fs.writeFileSync(path.join(dir, "r2.json"), JSON.stringify({ case: "y", grades: { a: false, b: null } }));
  expect([...failuresIn(dir)]).toEqual([["y", ["a"]]]);
});

test("parseArgs rejects unknown flags", () => {
  expect(() => parseArgs(["--nope"])).toThrow();
  expect(parseArgs(["--base", "main"]).base).toBe("main");
});
