import { describe, test, expect } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
const require = createRequire(import.meta.url);
const bc = require("./autonomous-busy-check.js");

const procs = [
  { pid: 10, name: "node.exe", cmd: "node server.js" },
  { pid: 11, name: "python.exe", cmd: "python Train_Model.py --epochs 9" },
];

describe("findBusy", () => {
  test("matches a command line, case-insensitively", () => {
    expect(bc.findBusy({ procs, patterns: ["train_model"] })).toEqual([{ why: "process", name: "python.exe" }]);
    expect(bc.findBusy({ procs, patterns: ["PYTHON.EXE"] })).toHaveLength(1);
  });
  test("no match and empty patterns are free", () => {
    expect(bc.findBusy({ procs, patterns: ["ffmpeg"] })).toEqual([]);
    expect(bc.findBusy({ procs, patterns: [] })).toEqual([]);
    expect(bc.findBusy({ procs, patterns: ["  "] })).toEqual([]);
  });
  test("dead-PID lock ignored, live-PID lock found", () => {
    const lockFiles = [{ file: "C:/x/render.lock", pid: 500 }, { file: "C:/x/old.lock", pid: 501 }];
    const r = bc.findBusy({ lockFiles, isAlive: (p) => p === 500 });
    expect(r).toEqual([{ why: "lock", name: "render" }]);
  });
  test("own pid / parent never match", () => {
    expect(bc.findBusy({ procs, patterns: ["python"], selfPids: [11] })).toEqual([]);
    expect(bc.findBusy({ lockFiles: [{ file: "a.lock", pid: 7 }], isAlive: () => true, selfPids: [7] })).toEqual([]);
  });
  test("readLockFiles parses PIDs from a dir", () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "busy-"));
    fs.writeFileSync(path.join(d, "a.lock"), "123\n");
    fs.writeFileSync(path.join(d, "b.txt"), "9");
    expect(bc.readLockFiles(d)).toEqual([{ file: path.join(d, "a.lock"), pid: 123 }]);
    expect(bc.readLockFiles(path.join(d, "missing"))).toEqual([]);
  });
});

describe("waitUntilFree", () => {
  test("stops as soon as the job is gone", async () => {
    let t = 0; let calls = 0;
    const deps = { patterns: ["x"], lockFiles: [], now: () => t, sleep: async (ms) => { t += ms; },
      listProcs: () => (++calls < 3 ? [{ pid: 1, name: "x.exe", cmd: "" }] : []), selfPids: [] };
    const r = await bc.waitUntilFree({ intervalMin: 10, capMin: 360 }, deps);
    expect(r).toEqual({ busy: [], capped: false });
    expect(t).toBe(20 * 60000);
  });
  test("gives up at the cap while still busy", async () => {
    let t = 0;
    const deps = { patterns: ["x"], lockFiles: [], now: () => t, sleep: async (ms) => { t += ms; },
      listProcs: () => [{ pid: 1, name: "x.exe", cmd: "" }], selfPids: [] };
    const r = await bc.waitUntilFree({ intervalMin: 10, capMin: 30 }, deps);
    expect(r.capped).toBe(true);
    expect(r.busy).toHaveLength(1);
    expect(t).toBe(30 * 60000);
  });
});
