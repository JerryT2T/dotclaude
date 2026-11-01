import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const ts = require("./turn-state.js");

let sid;
beforeEach(() => { sid = `ts-test-${process.pid}-${Math.random().toString(36).slice(2)}`; });
afterEach(() => { try { fs.unlinkSync(ts.stateFile(sid)); } catch { /* none */ } });

describe("turn-state", () => {
  test("unset key reads null, set/get round-trips as string", () => {
    expect(ts.get(sid, "a")).toBeNull();
    ts.set(sid, "a", 42);
    expect(ts.get(sid, "a")).toBe("42");
  });

  test("keys live side by side in one file under tmpdir", () => {
    ts.set(sid, "a", "1");
    ts.set(sid, "b", "2");
    expect(ts.readState(sid)).toEqual({ a: "1", b: "2" });
    expect(path.dirname(ts.stateFile(sid))).toBe(os.tmpdir());
  });

  test("del removes only its key and reports whether it was set", () => {
    ts.set(sid, "a", "1");
    ts.set(sid, "b", "2");
    expect(ts.del(sid, "a")).toBe(true);
    expect(ts.del(sid, "a")).toBe(false);
    expect(ts.readState(sid)).toEqual({ b: "2" });
  });

  test("corrupt or non-object file reads as empty state", () => {
    fs.writeFileSync(ts.stateFile(sid), "{not json");
    expect(ts.readState(sid)).toEqual({});
    fs.writeFileSync(ts.stateFile(sid), "[1,2]");
    expect(ts.get(sid, "0")).toBeNull();
  });

  test("atomic write leaves no temp file behind", () => {
    ts.set(sid, "a", "1");
    const base = path.basename(ts.stateFile(sid));
    const left = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith(base) && f.endsWith(".tmp"));
    expect(left).toEqual([]);
  });

  test("missing session id uses the 'unknown' key like sessionFile", () => {
    expect(ts.stateFile(undefined)).toMatch(/turn-state-unknown\.json$/);
  });
});
