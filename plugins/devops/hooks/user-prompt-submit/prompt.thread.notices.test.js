/** prompt.thread.notices — SessionStart notices stay out of a thread; Desktop and terminal sessions are untouched. */
import { describe, test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hook from "./prompt.thread.notices.js";

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "prompt.thread.notices.js");
const run = (payload) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: "utf8" });

describe("decide", () => {
  test("thread with the feature, first time -> the one-line instruction", () => {
    expect(hook.decide({ mode: "on", said: false })).toBe(hook.LINE);
    expect(hook.LINE).toMatch(/Do not post them into this thread/);
  });
  test("thread already told -> silent", () => {
    expect(hook.decide({ mode: "on", said: true })).toBeNull();
  });
  test("Desktop / terminal session (mode off) and feature-off thread (quiet) -> silent", () => {
    expect(hook.decide({ mode: "off", said: false })).toBeNull();
    expect(hook.decide({ mode: "quiet", said: false })).toBeNull();
  });
});

describe("hint and blockCheck texts", () => {
  const base = { mode: "on", projectId: "chan_T1", remote: false, checked: false, value: "local-first", version: 1, lang: "en", pluginRoot: "/pr" };
  test("the setup hint names the real places and no project Plugins tab (de + en)", () => {
    for (const lang of ["de", "en"]) {
      const t = hook.HINT_TEXT[lang];
      expect(t).not.toMatch(/Projek\w*einstellungen > Plugins|Project settings > Plugins/);
      expect(t).not.toMatch(/—|;/);
    }
    expect(hook.HINT_TEXT.en).toMatch(/enabled once for your claude\.ai account under Plugins/);
    expect(hook.HINT_TEXT.en).toMatch(/Project settings > Memory > Project instructions/);
    expect(hook.HINT_TEXT.en).toMatch(/Environment > "Your computer"/);
    expect(hook.HINT_TEXT.de).toMatch(/Projekteinstellungen > Gedächtnis > Projektanweisungen/);
    expect(hook.HINT_TEXT.de).toMatch(/Umgebung > „Dein Computer“/);
  });
  test("hint tells the model to run the script for the location block and read the FIRST fenced block", () => {
    const t = hook.hint({ mode: "on", projectId: "chan_T1", hinted: false, remote: false, lang: "en", pluginRoot: "/pr" });
    expect(t).toContain('node "/pr/scripts/thread-location.js" block --project chan_T1');
    expect(t).toMatch(/FIRST fenced block/);
    const cf = hook.hint({ mode: "on", projectId: "chan_T1", hinted: false, remote: false, lang: "en", pluginRoot: "/pr", value: "cloud-first" });
    expect(cf).not.toContain("thread-location.js");
    expect(cf).not.toContain("Where threads run\" block");
  });
  test("hint stays silent when hinted, remote, feature off or no id", () => {
    const o = { mode: "on", projectId: "chan_T1", hinted: false, remote: false };
    expect(hook.hint({ ...o, hinted: true })).toBeNull();
    expect(hook.hint({ ...o, remote: true })).toBeNull();
    expect(hook.hint({ ...o, mode: "quiet" })).toBeNull();
    expect(hook.hint({ ...o, projectId: null })).toBeNull();
  });
  test("blockCheck names the marker line of the value and version, with the script as the text source", () => {
    const t = hook.blockCheck(base);
    expect(t).toContain("Where threads run (devops local-first, v1)");
    expect(t).toMatch(/another value or an older version/);
    expect(t).toContain('node "/pr/scripts/thread-location.js" block --project chan_T1');
    expect(t).toMatch(/nothing else checks it/);
  });
  test("blockCheck for cloud-first is the reverse: remove a block that is still there", () => {
    const t = hook.blockCheck({ ...base, value: "cloud-first" });
    expect(t).toContain("Where threads run (devops ");
    expect(t).toMatch(/None: say nothing/);
    expect(t).toContain(hook.BLOCK_REMOVE_TEXT.en);
  });
  test("blockCheck: silent when checked, remote, off or no project", () => {
    expect(hook.blockCheck({ ...base, checked: true })).toBeNull();
    expect(hook.blockCheck({ ...base, remote: true })).toBeNull();
    expect(hook.blockCheck({ ...base, mode: "off" })).toBeNull();
    expect(hook.blockCheck({ ...base, projectId: "" })).toBeNull();
  });
  test("the block texts exist in de and en without dashes or semicolons", () => {
    for (const s of [hook.BLOCK_TEXT.en("devops ask, v1"), hook.BLOCK_TEXT.de("devops ask, v1"), hook.BLOCK_REMOVE_TEXT.en, hook.BLOCK_REMOVE_TEXT.de]) {
      expect(s).not.toMatch(/—|;/);
    }
    expect(hook.BLOCK_TEXT.de("x")).toMatch(/„Text zeigen“|Text zeigen/);
  });
});

describe("process", () => {
  test("a typed Desktop prompt prints nothing", () => {
    const r = run({ session_id: "thread-notices-desktop", prompt: "hello", cwd: process.cwd() });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });
});
