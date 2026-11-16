import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = path.join(import.meta.dirname, "gen-dk-index.mjs");
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", windowsHide: true });

describe("gen-dk-index --check", () => {
  it("the shipped deep-knowledge/INDEX.md is current", () => {
    const r = run("--check");
    expect(r.stderr).toMatch(/up-to-date/);
    expect(r.status).toBe(0);
  });

  it("a stale index exits 1 and is left as it was", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dk-index-"));
    const dk = path.join(root, "deep-knowledge");
    fs.mkdirSync(dk);
    fs.writeFileSync(path.join(dk, "a.md"), "# Topic A\n\nWhat A is about.\n");
    fs.writeFileSync(path.join(dk, "INDEX.md"), "old\n");
    try {
      const stale = run("--check", dk);
      expect(stale.status).toBe(1);
      expect(stale.stderr).toMatch(/stale or missing/);
      expect(fs.readFileSync(path.join(dk, "INDEX.md"), "utf8")).toBe("old\n");

      expect(run(dk).status).toBe(0);
      expect(fs.readFileSync(path.join(dk, "INDEX.md"), "utf8")).toMatch(/\| \[a\.md\]\(a\.md\) \| Topic A \| What A is about\. \|/);
      expect(run("--check", dk).status).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
