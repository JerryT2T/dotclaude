import { describe, test, expect, vi, beforeAll, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bandCarriesCard, BAND_FRESH_MS } from "./lib/band-marker.js";

// Etappe A (#3 d-limit/d-enforce, #2 d-level/d-detect): 120-char points with a
// refuse-once, and the minimal widget when the mod band carries the card.
// Same harness as index.card.answer.test.js.
process.env.DEVOPS_COMPLETION_NO_USAGE = "1";
process.env.DEVOPS_CARD_PREGATE = "0";
process.env.CLAUDE_CODE_ENTRYPOINT = "cli";

const captured = vi.hoisted(() => ({ handlers: {} }));

vi.mock("./lib/ensure-deps.js", () => ({ ensureDeps: async () => {} }));
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    registerTool(name, _cfg, handler) { captured.handlers[name] = handler; }
    async connect() {}
  },
}));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class {},
}));
vi.mock("zod", () => {
  const node = new Proxy(() => node, { get: () => () => node });
  const z = new Proxy({}, { get: () => () => node });
  return { z };
});

let render;
beforeAll(async () => {
  await import("./index.js");
  render = captured.handlers["render_completion_card"];
}, 60_000);

const allText = (res) => res.content.map((c) => c.text).join("\n");
const LONG = "Sechs nie freigeschaltete Konten liegen noch in der Benutzerliste und werden bei jedem Lauf erneut geprüft — löschen oder freischalten ist deine Entscheidung.";
const base = (sid, extra = {}) => ({ variant: "analysis", summary: "Band-Test", lang: "de", session_id: sid, ...extra });

const restore = [];
afterEach(() => { while (restore.length) restore.pop()(); });
function env(key, value) {
  const prev = process.env[key];
  restore.push(() => { if (prev === undefined) delete process.env[key]; else process.env[key] = prev; });
  process.env[key] = value;
}
function markerHome(sessions) {
  const home = mkdtempSync(join(tmpdir(), "band-home-"));
  mkdirSync(join(home, ".claude"));
  writeFileSync(join(home, ".claude", "devops-band-active.json"), JSON.stringify({ sessions }));
  env("HOME", home);
  env("USERPROFILE", home);
  restore.push(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

describe("card points — 120 characters, refused once (d-limit, d-enforce)", () => {
  test("the first over-length card is refused, naming each point and its length", async () => {
    env("DEVOPS_CARD_PREGATE", "1");
    const res = await render(base("band-refuse-1", { open: [{ text: LONG }, { text: "Kurz." }] }));
    expect(res.isError).toBe(true);
    const text = allText(res);
    expect(text).toContain(`point 1: ${LONG.length} characters`);
    expect(text).not.toContain("point 2");
    expect(text).toContain("≤ 120");
  });

  test("the second try renders, the point clamped with … to 120", async () => {
    env("DEVOPS_CARD_PREGATE", "1");
    const args = () => base("band-refuse-2", { open: [{ text: LONG }] });
    expect((await render(args())).isError).toBe(true);
    const res = await render(args());
    expect(res.isError).toBeUndefined();
    const line = allText(res).split("\n").find((l) => l.startsWith("1. "));
    expect(line).toBeTruthy();
    expect(line.endsWith("…")).toBe(true);
    expect(line.slice(3).replace(/^\S+ /, "").length).toBeLessThanOrEqual(120);
  });

  test("a short point is never refused", async () => {
    env("DEVOPS_CARD_PREGATE", "1");
    const res = await render(base("band-refuse-3", { open: [{ text: "Kurz und klar." }] }));
    expect(res.isError).toBeUndefined();
  });

  test("without a session id the point is clamped, not refused", async () => {
    env("DEVOPS_CARD_PREGATE", "1");
    const res = await render({ variant: "analysis", summary: "Band-Test", lang: "de", open: [{ text: LONG }] });
    expect(res.isError).toBeUndefined();
    expect(allText(res)).toContain("…");
  });
});

describe("minimal widget while the band carries the card (d-level, d-detect)", () => {
  const widgetOf = (text) => text.slice(text.indexOf("----- widget_code -----"));
  const open = [{ text: "Entscheidung offen.", reply: "Ja." }];

  test("fresh marker, remoteControl false: widget holds answer + heading only; the result still carries the full dc-card-data", async () => {
    env("CLAUDE_CODE_ENTRYPOINT", "claude-desktop");
    markerHome({ "band-min-1": { at: Date.now(), remoteControl: false } });
    const res = await render(base("band-min-1", { answer: "Die **Antwort**.", open }));
    const text = allText(res);
    const widget = widgetOf(text);
    expect(widget).toContain("dc-answer");
    expect(widget).toContain('id="dc-card"');
    expect(widget).toContain('class="card-head"');
    // only the decision (heading + button prompts) for prompt.ship.detect: no points, no executable script
    const wd = JSON.parse(widget.match(/id="dc-card-data">([\s\S]*?)<\/script>/)[1]);
    expect(Object.keys(wd).sort()).toEqual(["bt", "h"]);
    expect(wd.bt.every(b => Object.keys(b).join() === "p")).toBe(true);
    expect(widget).not.toMatch(/<script(?![^>]*application\/json)/);
    // band contract: the first dc-card-data in the result text parses with points + buttons
    const m = text.match(/<script type="application\/json" id="dc-card-data">([\s\S]*?)<\/script>/);
    expect(m).toBeTruthy();
    const d = JSON.parse(m[1]);
    expect(d.h).toBeTruthy();
    expect(d.pt.length).toBeGreaterThan(0);
    expect(d.bt.length).toBeGreaterThan(0);
    expect(text.indexOf("dc-card-data")).toBeLessThan(text.indexOf("----- widget_code -----"));
    expect(text).toContain("compact form");
  });

  test.each([
    ["remoteControl true", { at: Date.now(), remoteControl: true }],
    ["remoteControl null", { at: Date.now(), remoteControl: null }],
    ["stale entry", { at: Date.now() - BAND_FRESH_MS - 1000, remoteControl: false }],
  ])("%s: the full card, as today", async (_name, entry) => {
    env("CLAUDE_CODE_ENTRYPOINT", "claude-desktop");
    markerHome({ "band-full-1": entry });
    const text = allText(await render(base("band-full-1", { open })));
    expect(widgetOf(text)).toContain("dc-card-data");
    expect(text).not.toContain("[CARD DATA");
    expect(text).not.toContain("compact form");
  });

  test("another session's marker / no marker file: the full card", async () => {
    env("CLAUDE_CODE_ENTRYPOINT", "claude-desktop");
    markerHome({ "someone-else": { at: Date.now(), remoteControl: false } });
    expect(widgetOf(allText(await render(base("band-full-2", { open }))))).toContain("dc-card-data");
    env("HOME", join(tmpdir(), "band-no-such-home"));
    env("USERPROFILE", join(tmpdir(), "band-no-such-home"));
    expect(widgetOf(allText(await render(base("band-full-2", { open }))))).toContain("dc-card-data");
  });
});

describe("bandCarriesCard", () => {
  test("unreadable file and missing session id read as not active", () => {
    const home = markerHome({});
    writeFileSync(join(home, ".claude", "devops-band-active.json"), "{ not json");
    expect(bandCarriesCard("s", { home })).toBe(false);
    expect(bandCarriesCard(undefined, { home })).toBe(false);
    expect(bandCarriesCard("unknown", { home })).toBe(false);
  });
});
