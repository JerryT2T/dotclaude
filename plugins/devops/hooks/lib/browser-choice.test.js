import { describe, test, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lib = require("./browser-choice.js");
const cfg = require("./devops-config.js");
const cli = require("../../scripts/browser-choice.js");

const tmp = [];
function mkHome() {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "browser-choice-")));
  tmp.push(d);
  return d;
}
afterEach(() => {
  while (tmp.length) fs.rmSync(tmp.pop(), { recursive: true, force: true });
});

const WIN_ENV = { PROGRAMFILES: "C:\\Program Files", "PROGRAMFILES(X86)": "C:\\Program Files (x86)", LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" };
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OPERA = "C:\\Users\\u\\AppData\\Local\\Programs\\Opera\\opera.exe";
const win = (...files) => ({ platform: "win32", env: WIN_ENV, exists: (p) => files.includes(p) });

describe("installedBrowsers", () => {
  test("Windows: only what exists below the program folders, Edge first", () => {
    expect(lib.installedBrowsers(win(CHROME, EDGE, OPERA))).toEqual([
      { id: "edge", label: "Microsoft Edge", exe: EDGE },
      { id: "chrome", label: "Google Chrome", exe: CHROME },
      { id: "opera", label: "Opera", exe: OPERA },
    ]);
    expect(lib.installedBrowsers(win())).toEqual([]);
  });

  test("macOS looks for the app bundle, Linux on PATH", () => {
    const mac = { platform: "darwin", home: "/Users/u", exists: (p) => p === "/Users/u/Applications/Firefox.app" };
    expect(lib.installedBrowsers(mac).map((b) => b.id)).toEqual(["firefox"]);
    const linux = { platform: "linux", env: { PATH: "/usr/bin:/snap/bin" }, exists: (p) => p === "/snap/bin/brave" };
    expect(lib.installedBrowsers(linux)).toEqual([{ id: "brave", label: "Brave", exe: "/snap/bin/brave" }]);
  });
});

describe("resolveBrowser", () => {
  test("auto: Edge when installed, else the first installed browser, else in-app", () => {
    expect(lib.resolveBrowser({ ...win(CHROME, EDGE), stored: "auto" }).id).toBe("edge");
    expect(lib.resolveBrowser({ ...win(CHROME), stored: "auto" }).id).toBe("chrome");
    const none = lib.resolveBrowser({ ...win(), stored: "auto" });
    expect(none).toMatchObject({ id: "in-app", exe: "" });
    expect(none.options).toEqual([{ id: "in-app", label: lib.IN_APP_LABEL }]);
  });

  test("a chosen browser wins while installed; a missing one falls back like auto; in-app stays in-app", () => {
    expect(lib.resolveBrowser({ ...win(CHROME, EDGE), stored: "chrome" })).toMatchObject({ id: "chrome", exe: CHROME, stored: "chrome" });
    expect(lib.resolveBrowser({ ...win(EDGE), stored: "chrome" })).toMatchObject({ id: "edge", stored: "chrome" });
    expect(lib.resolveBrowser({ ...win(CHROME, EDGE), stored: "in-app" }).id).toBe("in-app");
  });

  test("the options are the installed browsers plus In-App", () => {
    expect(lib.resolveBrowser({ ...win(CHROME, EDGE), stored: "auto" }).options.map((o) => o.id)).toEqual(["edge", "chrome", "in-app"]);
  });

  test("the stored choice is the machine-wide setting", () => {
    const home = mkHome();
    expect(lib.storedChoice({ cwd: home, home })).toBe("auto");
    cfg.setValue("browser.default", "firefox", "global", home, { home });
    expect(lib.storedChoice({ cwd: home, home })).toBe("firefox");
    expect(() => cfg.setValue("browser.default", "firefox", "project", home, { home })).toThrow(/machine-wide/);
  });

  test("the setting's values are the lib's", () => {
    expect([...cfg.SCHEMA.browser.default.values]).toEqual([...lib.SETTING_VALUES]);
  });
});

describe("openCommand", () => {
  test("Windows: Edge keeps `start \"\" msedge`, every other browser its quoted path; /min when minimized", () => {
    expect(lib.openCommand({ id: "edge", exe: EDGE }, "http://localhost:1/a.html", { platform: "win32" }))
      .toEqual({ cmd: "cmd.exe", args: ["/c", "start", '""', "msedge", '"http://localhost:1/a.html"'], verbatim: true });
    expect(lib.openCommand({ id: "chrome", exe: CHROME }, "u", { platform: "win32", minimized: true }).args)
      .toEqual(["/c", "start", '""', "/min", `"${CHROME}"`, '"u"']);
  });

  test("macOS opens the app by name, Linux the binary; in-app has no command", () => {
    expect(lib.openCommand({ id: "brave", exe: "/Applications/Brave Browser.app" }, "u", { platform: "darwin" })).toEqual({ cmd: "open", args: ["-a", "Brave Browser", "u"], verbatim: false });
    expect(lib.openCommand({ id: "firefox", exe: "/usr/bin/firefox" }, "u", { platform: "linux" })).toEqual({ cmd: "/usr/bin/firefox", args: ["u"], verbatim: false });
    expect(lib.openCommand({ id: "in-app", exe: "" }, "u", { platform: "win32" })).toBe(null);
    expect(lib.openCommand(null, "u")).toBe(null);
  });
});

describe("browserLine", () => {
  test("silent while Edge is in effect, one line otherwise", () => {
    expect(lib.browserLine({ ...win(EDGE), stored: "auto" })).toBe("");
    expect(lib.browserLine({ ...win(CHROME, EDGE), stored: "chrome" })).toMatch(/^\[browser\] Google Chrome \(chosen in devops Home\) — use it wherever a devops doc says Edge/);
    expect(lib.browserLine({ ...win(CHROME), stored: "auto" })).toContain("(Edge is not installed)");
    expect(lib.browserLine({ ...win(), stored: "auto" })).toMatch(/^\[browser\] in-app \(Edge is not installed\) — pages for the user open in the Desktop app's browser pane/);
    expect(lib.browserLine({ ...win(EDGE), stored: "in-app" })).toContain("in-app (chosen in devops Home)");
  });
});

describe("scripts/browser-choice.js", () => {
  test("list: the browser in effect, the stored choice, the options", () => {
    expect(cli.listData({ ...win(CHROME, EDGE), stored: "auto" })).toEqual({
      effective: { id: "edge", label: "Microsoft Edge" },
      stored: "auto",
      options: [{ id: "edge", label: "Microsoft Edge" }, { id: "chrome", label: "Google Chrome" }, { id: "in-app", label: lib.IN_APP_LABEL }],
    });
  });

  test("set stores an installed browser, in-app or auto machine-wide and refuses the rest", () => {
    const home = mkHome();
    const o = { ...win(CHROME, EDGE), cwd: home, home };
    expect(cli.setChoice("chrome", o)).toMatchObject({ effective: { id: "chrome" }, stored: "chrome" });
    expect(lib.storedChoice({ cwd: home, home })).toBe("chrome");
    expect(cli.setChoice("in-app", o).effective.id).toBe("in-app");
    expect(cli.setChoice("auto", o).effective.id).toBe("edge");
    expect(() => cli.setChoice("firefox", o)).toThrow(/not installed/);
    expect(() => cli.setChoice("netscape", o)).toThrow(/unknown browser/);
    expect(lib.storedChoice({ cwd: home, home })).toBe("auto");
  });

  test("open: in-app has no process unless --external asks for one", () => {
    expect(cli.openPlan("u", { ...win(EDGE), stored: "in-app" })).toBe(null);
    expect(cli.openPlan("u", { ...win(EDGE), stored: "in-app", external: true }).args).toContain("msedge");
    expect(cli.openPlan("u", { ...win(), stored: "auto", external: true })).toEqual({ cmd: "cmd.exe", args: ["/c", "start", '""', '"u"'], verbatim: true });
    expect(cli.openPlan("u", { ...win(CHROME), stored: "auto", minimized: true }).args).toEqual(["/c", "start", '""', "/min", `"${CHROME}"`, '"u"']);
  });
});
