import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const mq = require("./merge-queue.js");
const decisions = require("./merge-decisions.js");

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-queue-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const hunk = (id, verdict, extra = {}) => ({
  id, file: "a.css", verdict, header: "@@ -1 +1 @@", commit: "abc1234", author: "Alex", upstreamPr: 42,
  hunk: "+x", ...extra,
});

describe("buildQueue", () => {
  test("splits lost hunks into restore (unseen-lost, moved) and open (decision verdicts)", () => {
    const check = {
      ok: true, anchor: "a1", survivedCount: 7,
      lost: [hunk("h1", "unseen-lost"), hunk("h2", "moved"), hunk("h3", "same-aspect-candidate"), hunk("h4", "overlap-candidate")],
    };
    const q = mq.buildQueue({ branch: "feat/x", base: "main", check, now: 0 });
    expect(q.restore.map((h) => h.id)).toEqual(["h1", "h2"]);
    expect(q.open.map((h) => h.id)).toEqual(["h3", "h4"]);
    expect(q.survivedCount).toBe(7);
    expect(q.branch).toBe("feat/x");
  });

  test("drops hunks the ledger already decides and counts them", () => {
    const check = { ok: true, anchor: "a1", survivedCount: 0, lost: [hunk("h3", "same-aspect-candidate"), hunk("h4", "same-aspect-candidate")] };
    let ledger = decisions.emptyLedger();
    ledger = decisions.recordDecision(ledger, decisions.aspectId("a.css", ".btn", "color"), { ship: "pr-1", by: "me", value: "red", hunks: ["h3"] });
    const q = mq.buildQueue({ branch: "b", base: "main", check, ledger });
    expect(q.open.map((h) => h.id)).toEqual(["h4"]);
    expect(q.resolvedCount).toBe(1);
  });

  test("a check that did not run yields no queue (never blocks, never overwrites)", () => {
    expect(mq.buildQueue({ branch: "b", base: "main", check: { ok: false, reason: "no-anchor" } })).toBeNull();
    expect(mq.buildQueue({})).toBeNull();
  });
});

describe("write / read / clear", () => {
  test("replaces the file on every run", () => {
    const check = (id) => ({ ok: true, anchor: "a1", survivedCount: 0, lost: [hunk(id, "unseen-lost")] });
    mq.writeQueue(dir, mq.buildQueue({ branch: "b", base: "main", check: check("h1") }));
    mq.writeQueue(dir, mq.buildQueue({ branch: "b", base: "main", check: check("h2") }));
    expect(mq.readQueue(dir).restore.map((h) => h.id)).toEqual(["h2"]);
    expect(fs.existsSync(path.join(dir, ".claude", "merge-queue.json"))).toBe(true);
    mq.clearQueue(dir);
    expect(mq.readQueue(dir)).toBeNull();
  });
});

describe("renderQueueLine", () => {
  test("names author/PR, restore vs open counts and the before-ship instruction", () => {
    const q = mq.buildQueue({
      branch: "b", base: "main",
      check: { ok: true, anchor: "a1", survivedCount: 3, lost: [hunk("h1", "unseen-lost"), hunk("h2", "same-aspect-candidate")] },
    });
    const line = mq.renderQueueLine(q);
    expect(line).toContain("Alex");
    expect(line).toContain("#42");
    expect(line).toContain("1 hunk(s) will be restored automatically, 1 need a decision");
    expect(line).toContain("BEFORE the ship");
    expect(line).toContain("auto-concept");
    expect(line).not.toContain("\n");
  });

  test("silent when nothing is lost", () => {
    const q = mq.buildQueue({ branch: "b", base: "main", check: { ok: true, anchor: "a", survivedCount: 5, lost: [] } });
    expect(mq.renderQueueLine(q)).toBeNull();
    expect(mq.renderQueueLine(null)).toBeNull();
  });
});
