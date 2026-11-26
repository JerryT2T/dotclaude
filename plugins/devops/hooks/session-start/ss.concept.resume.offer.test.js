import { describe, test, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { pageFacts, buildResumeOffer, buildOfferHint } from "./ss.concept.resume.js";

// #1239 — an unfinished concept after a restart. Where the devops mod can ask
// (feature `claude-mods`, alpha), the hook writes a resume offer for the band
// and tells the model not to relaunch; nothing relaunches before the person
// picks. Elsewhere the #348 relaunch and the #555 paused hint stay.

const HOOK = path.resolve(import.meta.dirname, "ss.concept.resume.js");
const PLUGIN_ROOT = path.resolve(import.meta.dirname, "..", "..");
const H = 3600_000;
const iso = (agoMs) => new Date(Date.now() - agoMs).toISOString();
const PAGE = '<html><head><title>Kategorien nach Einsatz</title></head><body>' +
  '<section data-iteration="1"></section><section data-iteration="3" data-active></section></body></html>';

function project({ channel = null, paused = false } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "concept-offer-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "concept-offer-home-"));
  fs.mkdirSync(path.join(home, ".claude", "plugins"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "devops@dotclaude": true } }));
  if (channel) fs.writeFileSync(path.join(home, ".claude", "plugins", ".channels.json"), JSON.stringify({ dotclaude: channel }));
  fs.mkdirSync(path.join(cwd, "docs", "concepts"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "docs", "concepts", "2026-11-23-kat.html"), PAGE);
  fs.mkdirSync(path.join(cwd, ".claude"));
  // Port 1 is never a listening bridge: the heartbeat probe fails fast.
  const state = { port: 1, html_path: "docs/concepts/2026-11-23-kat.html", slug: "kat", started_at: iso(2 * H) };
  if (paused) state.paused_at = iso(1 * H);
  fs.writeFileSync(path.join(cwd, ".claude", "concept-active.json"), JSON.stringify(state));
  return { cwd, home, offer: path.join(cwd, ".claude", "concept-resume-offer.json") };
}

function runHook({ cwd, home }) {
  const r = spawnSync(process.execPath, [HOOK], {
    cwd,
    input: JSON.stringify({ session_id: `vitest-offer-${process.pid}-${Date.now()}`, source: "startup" }),
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, HOME: home, USERPROFILE: home },
    encoding: "utf8",
    timeout: 20_000,
  });
  return { status: r.status, stdout: r.stdout || "" };
}

describe("pageFacts / buildResumeOffer", () => {
  test("title and the newest round come from the page; a broken page gives neither", () => {
    expect(pageFacts(PAGE)).toEqual({ title: "Kategorien nach Einsatz", round: 3 });
    expect(pageFacts("")).toEqual({ title: "", round: 0 });
  });

  test("the offer names slug, title, round and the newest activity", () => {
    const state = { port: 9, html_path: "docs/concepts/x.html", slug: "x", started_at: iso(5 * H), paused_at: iso(1 * H) };
    const o = buildResumeOffer(state, { lastActivityAt: iso(3 * H) }, PAGE);
    expect(o).toMatchObject({ slug: "x", title: "Kategorien nach Einsatz", round: 3, paused: true, port: 9 });
    expect(o.last_at).toBe(state.paused_at);
  });

  test("the hint forbids the relaunch now and names the band's two prompts", () => {
    const state = { port: 9, html_path: "docs/concepts/x.html", slug: "x", started_at: iso(1 * H) };
    const hint = buildOfferHint(state, buildResumeOffer(state, null, PAGE));
    expect(hint).toMatch(/Do NOT relaunch the bridge/);
    expect(hint).toMatch(/"Konzept x fortsetzen"/);
    expect(hint).toMatch(/"Konzept x abschließen"/);
  });
});

describe("session start with an unfinished concept (bridge dead, page present)", () => {
  for (const paused of [false, true]) {
    test(`alpha channel${paused ? ", paused" : ""}: exactly one offer, no relaunch order`, () => {
      const p = project({ channel: "alpha", paused });
      const r = runHook(p);
      expect(r.status).toBe(0);
      const offer = JSON.parse(fs.readFileSync(p.offer, "utf8"));
      expect(offer).toMatchObject({ slug: "kat", round: 3, paused });
      expect(r.stdout).toMatch(/Do NOT relaunch the bridge/);
      expect(r.stdout).not.toMatch(/Nothing is pending on disk\. Relaunch the bridge now/);
      expect(fs.existsSync(path.join(p.cwd, ".claude", "concept-active.json"))).toBe(true);
    });
  }

  test("stable channel (no mod): the #348 relaunch and the #555 hint stay, no offer file", () => {
    const p = project();
    expect(runHook(p).stdout).toMatch(/Relaunch the bridge now/);
    expect(fs.existsSync(p.offer)).toBe(false);
    const q = project({ paused: true });
    expect(runHook(q).stdout).toMatch(/Paused \/auto-concept page/);
    expect(fs.existsSync(q.offer)).toBe(false);
  });

  test("a leftover offer is removed when no concept is open any more", () => {
    const p = project({ channel: "alpha" });
    fs.unlinkSync(path.join(p.cwd, ".claude", "concept-active.json"));
    fs.writeFileSync(p.offer, JSON.stringify({ slug: "old", written_at: new Date().toISOString() }));
    runHook(p);
    expect(fs.existsSync(p.offer)).toBe(false);
  });
});
