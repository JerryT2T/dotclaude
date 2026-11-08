import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Side-session cards end to end through the offline renderer (concept
// 2026-11-07 subsession-cards, scenarios S1-S5): title prefix, heading, `›`
// lines and buttons come from one plan, so they cannot drift.
const SERVER = join(dirname(fileURLToPath(import.meta.url)), "index.js");
let dir;
let repo;

function render(payload) {
  const file = join(dir, "payload.json");
  const out = join(dir, "out.txt");
  writeFileSync(file, JSON.stringify({ summary: "Doku", lang: "de", cwd: repo, ...payload }));
  // stdout goes through a file: the CLI exits right after writing and a pipe can truncate.
  try { execSync(`node "${SERVER}" --render-card "${file}" > "${out}" 2>&1`, { env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: "claude-desktop", DEVOPS_COMPLETION_NO_USAGE: "1", DEVOPS_CARD_PREGATE: "0" } }); } catch { /* exit code read from the output */ }
  const text = readFileSync(out, "utf8");
  return {
    title: (text.match(/set the title to "([^"]*)"/) || [])[1],
    heading: ((text.match(/class="card-heading"[^>]*>([\s\S]*?)<\/h3>/) || [])[1] || "").replace(/<span aria-hidden="true"[^>]*> ↗<\/span>/g, "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').trim(),
    headingLinks: [...((text.match(/class="card-heading"[^>]*>([\s\S]*?)<\/h3>/) || [])[1] || "").matchAll(/data-prompt="([^"]*)"/g)].map((m) => m[1]),
    promote: /Promote|beta|stable/i.test((text.match(/id="card-act-\d+"[\s\S]*$/) || [""])[0]),
    context: [...text.matchAll(/class="card-context"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1].replace(/<span aria-hidden="true"[^>]*> ↗<\/span>/g, "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').trim()),
    buttons: [...text.matchAll(/id="card-act-\d+"[^>]*>[\s\S]*?<\/i>([^<]*)</g)].map((m) => m[1]),
  };
}

const L = (title, state, mode = "handoff", extra = {}) => ({ id: `local_${title}`, title, mode, state, ...extra });

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "linked-card-"));
  repo = join(dir, "repo");
  execFileSync("git", ["init", "-q", repo]);
  execFileSync("git", ["-C", repo, "remote", "add", "origin", "https://github.com/x/y.git"]);
  execFileSync("git", ["-C", repo, "-c", "user.email=a@b.c", "-c", "user.name=a", "commit", "-q", "--allow-empty", "-m", "init"]);
}, 30000);
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

describe("side-session cards through the offline renderer", () => {
  test("S1 step 1: handoff running -> ⏳ Linked title and heading, no buttons", () => {
    const r = render({ variant: "fallback", linked: [L("Doku-Umbau", "running")] });
    expect(r.title).toBe("⏳ ➜ 🔗 Linked ┃ ");
    expect(r.heading).toBe('⏳ 🔗 Linked — läuft in Side-Session „Doku-Umbau“, sie shippt selbst');
    expect(r.buttons).toEqual([]);
  }, 30000);

  test("S2: own diff -> normal Ready with the note, Ship stays", () => {
    const r = render({ variant: "ready", linked: [L("Doku-Umbau", "running")] });
    expect(r.title).toBe("👉 ➜ 📦 Ready ┃ ");
    expect(r.heading).toBe("👉 📦 Ready — Shippen?");
    expect(r.context.join(" ")).toContain('„Doku-Umbau“ läuft weiter und shippt selbst');
    expect(r.context.join(" ")).toContain('Läuft in: „Doku-Umbau“');
    expect(r.buttons).toEqual(["Ship"]);
  }, 30000);

  test("S3 step 1: orchestration with an own diff -> ⏳ Team, early-ship button", () => {
    const r = render({ variant: "ready", linked: [L("A", "done", "deliver"), L("B", "running", "deliver")] });
    expect(r.title).toBe("⏳ ➜ 🤖 Team ┃ ");
    expect(r.heading).toBe("⏳ 🤖 Team — noch nicht fertig — 1 von 2 Side-Sessions fertig");
    expect(r.buttons).toEqual(["Eigenen Teil jetzt shippen"]);
  }, 30000);

  test("S4: a failed part -> 👉 Question with three prepared replies", () => {
    const r = render({ variant: "fallback", linked: [L("A", "done", "deliver"), L("C", "failed", "deliver")] });
    expect(r.title).toBe("👉 ➜ ❓ Question ┃ ");
    expect(r.heading).toContain('„C“ ist gescheitert — ohne C integrieren, C neu starten oder abbrechen?');
    expect(r.buttons).toHaveLength(3);
  }, 30000);

  test("S1.4: the parent passes its own delivery, the side ship is newer -> side Released heading, no own promote buttons", () => {
    const r = render({
      variant: "released", linked: [L("Doku", "shipped", "handoff", { version: "0.363.0" })],
      delivery: { ship: { version: "0.362.0" }, promote: { channels: { alpha: "0.363.0", beta: "0.360.0", stable: "0.350.0" }, current: "alpha" } },
    });
    expect(r.heading).toContain("v0.363.0 — in Side-Session „Doku“ geshippt, hier ist nichts offen");
    expect(r.context.join(" ")).toContain("Eigenes Release v0.362.0");
    expect(r.promote).toBe(false);
  }, 30000);

  test("#1b: every named side session is a click, in the heading too, whatever its state", () => {
    const r = render({ variant: "fallback", linked: [L("Doku", "running")] });
    expect(r.headingLinks).toEqual(["Öffne die Side-Session „Doku“ (local_Doku) im Split-View."]);
    const s = render({ variant: "released", linked: [L("Doku", "shipped", "handoff", { version: "0.4.0" })] });
    expect(s.headingLinks).toEqual(["Öffne die Side-Session „Doku“ (local_Doku) im Split-View."]);
  }, 30000);

  test("delivered: 🟩 Delivered, no Ship button, 👉 only with an open point", () => {
    const plain = render({ variant: "delivered" });
    expect(plain.title).toBe("🟩 ➜ 📦 Delivered ┃ ");
    expect(plain.heading).toBe("🟩 📦 Delivered — Teil fertig — der Haupt-Chat integriert und shippt.");
    expect(plain.buttons).toEqual([]);
    const open = render({ variant: "delivered", open: ["Naming klären?"] });
    expect(open.title).toBe("👉 ➜ 📦 Delivered ┃ ");
    expect(open.buttons).not.toContain("Ship");
  }, 30000);
});

describe("hand-off to an existing session (#1085)", () => {
  const H = { session: "local_abc-123", title: "Nachschub HQ" };

  test("docs-only hand-off: heading names it, only 'Session öffnen'", () => {
    const r = render({ variant: "ready", handoff: H });
    expect(r.title).toBe("👉 ➜ 📦 Ready ┃ ");
    expect(r.heading).toBe("👉 📦 Ready — an Session „Nachschub HQ“ übergeben");
    expect(r.buttons).toEqual(["Session öffnen"]);
    expect(r.headingLinks.join(" ")).toContain("local_abc-123");
  }, 30000);

  test("with own shippable work: Ship and 'Session öffnen'", () => {
    const r = render({ variant: "ready", handoff: { ...H, ship: true } });
    expect(r.heading).toBe("👉 📦 Ready — an Session „Nachschub HQ“ übergeben — Shippen?");
    expect(r.buttons).toEqual(["Ship", "Session öffnen"]);
  }, 30000);

  test("english card", () => {
    const r = render({ variant: "ready", lang: "en", handoff: H });
    expect(r.heading).toBe("👉 📦 Ready — handed to session “Nachschub HQ”");
    expect(r.buttons).toEqual(["Open session"]);
  }, 30000);

  test("an invalid session id never renders a hand-off", () => {
    const r = render({ variant: "ready", handoff: { session: "abc", title: "X" } });
    expect(r.heading).not.toContain("übergeben");
    expect(r.buttons).not.toContain("Session öffnen");
  }, 30000);
});
