import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { findStaleTitles, interruptedFor, offlineFor } from "../lib/stale-titles.js";
import { buildContext, nextSeen } from "./ss.title.sweep.js";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const NOW = Date.parse("2026-10-23T12:00:00Z");
const MIN = 60_000;

let tmp, root, gov;

/** A session `id` under `slug` with `title`, its transcript last written `ageMin` ago. */
function session(slug, id, title, ageMin, { sidecarAgeMin = ageMin } = {}) {
  const dir = path.join(root, slug, id);
  fs.mkdirSync(dir, { recursive: true });
  const sidecar = path.join(dir, "custom-title.json");
  fs.writeFileSync(sidecar, JSON.stringify({ customTitle: title }));
  const jsonl = path.join(root, slug, `${id}.jsonl`);
  fs.writeFileSync(jsonl, "{}\n");
  const at = (m) => new Date(NOW - m * MIN);
  fs.utimesSync(sidecar, at(sidecarAgeMin), at(sidecarAgeMin));
  fs.utimesSync(jsonl, at(ageMin), at(ageMin));
}

const find = (o = {}) => findStaleTitles({ root, governorDir: gov, now: NOW, ...o });

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "title-sweep-"));
  root = path.join(tmp, "projects");
  gov = path.join(tmp, "governor");
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(gov, { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("interruptedFor", () => {
  test("every ⏳ form becomes Interrupted on the bare title", () => {
    expect(interruptedFor("⏳ ➜ 🤖 Fix login")).toBe("👉 ➜ ⚡ Fix login");
    expect(interruptedFor("⏳ ➜ 🤖🤖🤖 Phase 1")).toBe("👉 ➜ ⚡ Phase 1");
    expect(interruptedFor("⏳ ➜ 🚀 Ship it")).toBe("👉 ➜ ⚡ Ship it");
    expect(interruptedFor("⏳ ┃ 🧭 Concept ➜ 🤖 Phase 3")).toBe("👉 ➜ ⚡ Phase 3");
    expect(interruptedFor("⏳ Übungen")).toBe("👉 ➜ ⚡ Übungen");
  });

  test("non-⏳ and empty titles stay", () => {
    expect(interruptedFor("👉 ➜ 🧭 Page")).toBeNull();
    expect(interruptedFor("🔴 ➜ 🧭 Page")).toBeNull();
    expect(interruptedFor("🟩 ➜ 📊 X")).toBeNull();
    expect(interruptedFor("Plain title")).toBeNull();
    expect(interruptedFor("⏳ ")).toBeNull();
    expect(interruptedFor(null)).toBeNull();
  });
});

describe("offlineFor", () => {
  test("concept heads get the red status, everything else stays", () => {
    expect(offlineFor("👉 ➜ 🧭 Page")).toBe("🔴 ➜ 🧭 Page");
    expect(offlineFor("⏳ ➜ 🧭 Page")).toBe("🔴 ➜ 🧭 Page");
    expect(offlineFor("🔴 ➜ 🧭 Page")).toBeNull();
    expect(offlineFor("⏳ ➜ 🤖 Page")).toBeNull();
    expect(offlineFor("👉 ➜ 🧭 ")).toBeNull();
  });
});

describe("findStaleTitles", () => {
  test("finds an idle ⏳ session, skips idle-too-briefly, non-⏳ and self", () => {
    session("C--r-app", "aaa", "⏳ ➜ 🤖 Crashed work", 30);
    session("C--r-app", "bbb", "⏳ ➜ 🤖 Just now", 1);
    session("C--r-app", "ccc", "🟩 ➜ 📦 Done", 30);
    session("C--r-app", "self", "⏳ ➜ 🤖 Me", 30);
    expect(find({ selfId: "self" }).map((s) => [s.sessionId, s.next]))
      .toEqual([["aaa", "👉 ➜ ⚡ Crashed work"]]);
  });

  test("a live governor pid keeps the session (process still there)", () => {
    session("C--r-app", "live", "⏳ ➜ 🤖🤖🤖 Agents running", 30);
    fs.writeFileSync(path.join(gov, "live.json"), JSON.stringify({ claudePid: process.pid }));
    session("C--r-app", "dead", "⏳ ➜ 🤖 Gone", 30);
    fs.writeFileSync(path.join(gov, "dead.json"), JSON.stringify({ claudePid: 2 ** 22 + 12345 }));
    expect(find().map((s) => s.sessionId)).toEqual(["dead"]);
  });

  test("#964: a live session idle for an hour with only a dev server open is handed on; real open work keeps it", () => {
    const launch = (id, cmd) => [
      { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id, name: "Bash", input: { command: cmd, run_in_background: true } }] } },
      { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text: "Command running in background with ID: " + id + ". Output is being written to: C:\t\\" + id + ".output. You will be notified when it completes." }] }] } },
    ].map((l) => JSON.stringify(l)).join("\n") + "\n";
    for (const [id, cmd] of [["srv", "ng serve"], ["tst", "npm test"]]) {
      session("C--r-app", id, "⏳ ➜ 🤖🤖🤖 Work", 90);
      fs.writeFileSync(path.join(gov, id + ".json"), JSON.stringify({ claudePid: process.pid }));
      const jsonl = path.join(root, "C--r-app", id + ".jsonl");
      fs.writeFileSync(jsonl, launch("bg" + id, cmd));
      const at = new Date(NOW - 90 * MIN);
      fs.utimesSync(jsonl, at, at);
    }
    expect(find().map((s) => s.sessionId)).toEqual(["srv"]);
  });

  test("a session under several slugs: newest sidecar wins, newest transcript decides idleness", () => {
    session("C--r-app", "moved", "⏳ ➜ 🤖 Old name", 600);
    session("C--r-app--claude-worktrees-x", "moved", "⏳ ➜ 🤖 New name", 20);
    expect(find().map((s) => s.title)).toEqual(["⏳ ➜ 🤖 New name"]);
    session("C--r-app--claude-worktrees-y", "moved", "⏳ ➜ 🤖 Old", 1, { sidecarAgeMin: 900 });
    expect(find()).toEqual([]);
  });

  test("sidecars older than 7 days and already-seen transcripts are skipped", () => {
    session("C--r-app", "old", "⏳ ➜ 🤖 Ancient", 8 * 24 * 60);
    session("C--r-app", "seen", "⏳ ➜ 🤖 Reported", 30);
    const seenMtime = NOW - 30 * MIN;
    expect(find({ seen: { seen: seenMtime } })).toEqual([]);
    expect(find({ seen: { seen: seenMtime - 1 } }).map((s) => s.sessionId)).toEqual(["seen"]);
  });

  describe("concept offline (🔴)", () => {
    const WT = "P:\\Projects\\app\\.claude\\worktrees\\x";
    let reg;
    const withCwd = (id, cwd) => {
      const jsonl = path.join(root, "C--r-app", `${id}.jsonl`);
      const st = fs.statSync(jsonl);
      fs.writeFileSync(jsonl, JSON.stringify({ type: "user", cwd }) + "\n");
      fs.utimesSync(jsonl, st.atime, st.mtime);
    };
    const bridgeEntry = (port, o) => fs.writeFileSync(path.join(reg, `${port}.json`),
      JSON.stringify({ port, pid: 4242, worktree: WT, html_path: "docs/concepts/a.html", started_at: new Date(NOW - 10 * MIN).toISOString(), ...o }));
    const findB = (o = {}) => find({ bridge: { registryDir: reg, bootMs: NOW - 60 * MIN, tmpDir: tmp, isAlive: (pid) => pid === 4242, ...o } });

    beforeEach(() => { reg = path.join(tmp, "bridges"); fs.mkdirSync(reg, { recursive: true }); });

    test("a waiting concept without a bridge turns red", () => {
      session("C--r-app", "cw", "👉 ➜ 🧭 Review page", 30);
      withCwd("cw", WT);
      expect(findB().map((s) => [s.sessionId, s.next])).toEqual([["cw", "🔴 ➜ 🧭 Review page"]]);
    });

    test("a working concept without a bridge turns red, not Interrupted", () => {
      session("C--r-app", "cx", "⏳ ➜ 🧭 Round 3", 30);
      withCwd("cx", WT);
      expect(findB().map((s) => s.next)).toEqual(["🔴 ➜ 🧭 Round 3"]);
    });

    test("a live bridge for the worktree keeps the title", () => {
      session("C--r-app", "cl", "👉 ➜ 🧭 Live", 30);
      withCwd("cl", WT);
      bridgeEntry(8800);
      expect(findB()).toEqual([]);
    });

    test("a registry entry from before the last boot is dead even if its pid is reused", () => {
      session("C--r-app", "cb", "👉 ➜ 🧭 Rebooted", 30);
      withCwd("cb", WT);
      bridgeEntry(8801, { started_at: new Date(NOW - 120 * MIN).toISOString() });
      expect(findB().map((s) => s.sessionId)).toEqual(["cb"]);
    });

    test("an entry for another worktree or a dead pid does not count", () => {
      session("C--r-app", "co", "👉 ➜ 🧭 Other", 30);
      withCwd("co", WT);
      bridgeEntry(8802, { worktree: "P:\\Projects\\other" });
      bridgeEntry(8803, { pid: 1 });
      expect(findB().map((s) => s.sessionId)).toEqual(["co"]);
    });

    test("the concept checkout from the watcher pointer counts too (#1090)", () => {
      session("C--r-app", "cp", "👉 ➜ 🧭 Elsewhere", 30);
      withCwd("cp", "P:\\Projects\\launcher");
      fs.writeFileSync(path.join(tmp, "dotclaude-devops-concept-state-cp"), WT + "\\.claude\\concept-active.json");
      bridgeEntry(8804);
      expect(findB()).toEqual([]);
    });

    test("no known cwd keeps a waiting concept as it is", () => {
      session("C--r-app", "cn", "👉 ➜ 🧭 Unknown", 30);
      expect(findB()).toEqual([]);
    });
  });

  test("missing root → empty", () => {
    expect(findStaleTitles({ root: path.join(tmp, "nope"), now: NOW })).toEqual([]);
  });
});

describe("ss.title.sweep context", () => {
  test("silent without candidates", () => {
    expect(buildContext([])).toBeNull();
  });

  test("lists exact old → new titles and the isRunning:false guard", () => {
    const ctx = buildContext([{ sessionId: "a", title: "⏳ ➜ 🤖 X", next: "👉 ➜ ⚡ X", mtimeMs: 1 }]);
    expect(ctx).toContain("isRunning:false");
    expect(ctx).toContain("list_sessions");
    expect(ctx).toContain('"⏳ ➜ 🤖 X" → "👉 ➜ ⚡ X"');
  });

  test("seen map records new entries and drops ones past the TTL", () => {
    const out = nextSeen({ keep: NOW - MIN, drop: NOW - 15 * 24 * 60 * MIN, bad: "x" }, [{ sessionId: "n", mtimeMs: 5 }], NOW);
    expect(out).toEqual({ keep: NOW - MIN, n: 5 });
  });
});

describe("the scan runs detached", () => {
  const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "ss.title.sweep.js");
  const runPhase = (phase) => {
    const sess = path.join(tmp, ".claude", "projects", "slug");
    const id = "11111111-1111-1111-1111-111111111111";
    fs.mkdirSync(path.join(sess, id), { recursive: true });
    fs.writeFileSync(path.join(sess, id, "custom-title.json"), JSON.stringify({ customTitle: "⏳ ➜ 🤖 Stale" }));
    fs.writeFileSync(path.join(sess, id + ".jsonl"), "{}\n");
    const old = new Date(Date.now() - 60 * MIN);
    fs.utimesSync(path.join(sess, id + ".jsonl"), old, old);
    const env = { ...process.env, HOME: tmp, USERPROFILE: tmp, TEMP: tmp, TMP: tmp, TMPDIR: tmp, DEVOPS_TITLE_SWEEP_SEEN: path.join(tmp, "seen.json") };
    delete env.DEVOPS_DEFERRED_PHASE;
    if (phase) env.DEVOPS_DEFERRED_PHASE = phase;
    return spawnSync(process.execPath, [HOOK], { encoding: "utf8", input: JSON.stringify({ session_id: "other" }), env, cwd: tmp }).stdout;
  };

  test("the worker prints the plain rename list that is stored for the next prompt", () => {
    const out = runPhase("bg");
    expect(out).toMatch(/^\[ss\.title\.sweep\]/);
    expect(out).toMatch(/👉 ➜ ⚡ /u);
  }, 30_000);
});
