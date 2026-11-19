import { describe, test, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bandCardPath, writeBandCard } from "./band-marker.js";

// #1150: the offline renderer leaves the card's band data where the mod band reads it.
const INDEX = join(dirname(fileURLToPath(import.meta.url)), "..", "index.js");

describe("writeBandCard / bandCardPath (#1150)", () => {
  test("writes { writtenAt, text } under <home>/.claude/devops-band, keyed by the session", () => {
    const home = mkdtempSync(join(tmpdir(), "band-card-"));
    try {
      expect(writeBandCard("sid-1", "<script>x</script>", { home, now: Date.parse("2026-11-19T10:00:00Z") })).toBe(true);
      const file = bandCardPath("sid-1", home);
      expect(file).toBe(join(home, ".claude", "devops-band", "card-sid-1.json"));
      expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ writtenAt: "2026-11-19T10:00:00.000Z", text: "<script>x</script>" });
      // A path-shaped id stays inside the folder.
      expect(bandCardPath("../evil", home)).toBe(join(home, ".claude", "devops-band", "card-.._evil.json"));
    } finally { rmSync(home, { recursive: true, force: true }); }
  });

  test("no session id, 'unknown' or no text → nothing written", () => {
    const home = mkdtempSync(join(tmpdir(), "band-card-"));
    try {
      expect(writeBandCard("", "t", { home })).toBe(false);
      expect(writeBandCard("unknown", "t", { home })).toBe(false);
      expect(writeBandCard("sid", "", { home })).toBe(false);
      expect(existsSync(join(home, ".claude", "devops-band"))).toBe(false);
    } finally { rmSync(home, { recursive: true, force: true }); }
  });

  test("the --render-card CLI writes the card's #dc-card-data for its session", async () => {
    const home = mkdtempSync(join(tmpdir(), "band-card-cli-"));
    try {
      const payload = join(home, "p.json");
      writeFileSync(payload, JSON.stringify({ variant: "analysis", summary: "Offline Card", lang: "de", session_id: "sid-cli", cwd: home }));
      const env = { ...process.env, HOME: home, USERPROFILE: home, DEVOPS_COMPLETION_NO_USAGE: "1", DEVOPS_CARD_PREGATE: "0", CLAUDE_CODE_ENTRYPOINT: "cli" };
      const code = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [INDEX, "--render-card", payload], { env, cwd: home });
        child.stdout.resume();
        child.stderr.resume();
        child.on("error", reject);
        child.on("close", resolve);
      });
      expect(code).toBe(0);
      const stored = JSON.parse(readFileSync(bandCardPath("sid-cli", home), "utf8"));
      expect(stored.text).toMatch(/<script type="application\/json" id="dc-card-data">/);
      expect(JSON.parse(stored.text.match(/id="dc-card-data">([\s\S]*?)<\/script>/)[1]).ti).toBe("Offline Card");
      expect(Number.isFinite(Date.parse(stored.writtenAt))).toBe(true);
    } finally { rmSync(home, { recursive: true, force: true }); }
  }, 60_000);
});
