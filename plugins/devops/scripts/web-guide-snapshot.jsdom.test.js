// #1174: the page snapshot `payload wait` attaches to every result, run in a
// real DOM: dialog headings and button labels in, input values out, key-like
// strings masked, and a timeout result carries it too.
import { describe, test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "web-guide.js");

const HTML = `<!doctype html><body>
  <h1>API-Schlüssel</h1>
  <button>Schlüssel erstellen</button>
  <button style="display:none">Versteckt</button>
  <div role="dialog"><h2>Mit der Claude API verbinden</h2>
    <input id="k" type="password" value="sk-ant-api03-SECRETVALUE1234567890abcdef">
    <input id="n" value="mein-geheimer-name">
    <button>Weiter</button><button aria-label="Schließen"></button>
    <button>sk-ant-api03-SECRETLABEL1234567890abcdef</button></div>
  <div role="dialog" hidden><h2>Unsichtbarer Dialog</h2></div>
</body>`;

async function runWait(type = "timeout") {
  const dom = new JSDOM(HTML, { url: "https://console.example/settings/keys?x=secret#frag", runScripts: "outside-only" });
  const w = dom.window;
  w.claudeGuide = {
    wait: async () => ({ type }),
    stringify: (v) => JSON.stringify(v),
  };
  const snippet = execFileSync("node", [CLI, "payload", "wait", "5000"], { encoding: "utf8" });
  const out = await w.eval(`(async () => ${snippet})()`);
  return { raw: out, ev: JSON.parse(out) };
}

describe("payload wait page snapshot (jsdom)", () => {
  test("a timeout result carries dialogs, buttons and the bare path", async () => {
    const { ev } = await runWait("timeout");
    expect(ev.type).toBe("timeout");
    expect(ev.page.path).toBe("/settings/keys");
    expect(ev.page.dialogs).toEqual(["Mit der Claude API verbinden"]);
    expect(ev.page.buttons).toEqual(expect.arrayContaining(["Schlüssel erstellen", "Weiter", "Schließen"]));
    expect(ev.page.buttons).not.toContain("Versteckt");
  });

  test("no input value, query or fragment ever appears; key-like strings are masked", async () => {
    const { raw, ev } = await runWait("next");
    expect(ev.type).toBe("next");
    for (const leak of ["SECRETVALUE", "mein-geheimer-name", "x=secret", "frag", "SECRETLABEL"]) expect(raw).not.toContain(leak);
    expect(ev.page.buttons).toContain("***");
  });
});
