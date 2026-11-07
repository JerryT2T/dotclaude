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
    heading: ((text.match(/class="card-heading"[^>]*>([^<]*)</) || [])[1] || "").replace(/&quot;/g, '"'),
    context: [...text.matchAll(/class="card-context"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').trim()),
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
