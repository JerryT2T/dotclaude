import { describe, test, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { sweepConceptStores } from "./ss.concept.resume.js";

// A spec kept after code landed (#936) used to carry a card line "Vorlage zum
// Abgleich, 30 Tage lokal" while its 30 days ended only when Claude happened to
// close another concept by hand. The sweep now runs at every session start, so
// the lifecycle is automatic and the card says nothing about it.

const DAY = 24 * 3600_000;
const NOW = Date.parse("2026-11-15T12:00:00Z");

function store(root, slug, { ageDays, spec = false, unprocessed = false, page = false }) {
  const dir = path.join(root, ".claude", "concepts", slug);
  fs.mkdirSync(dir, { recursive: true });
  const state = path.join(dir, "state.json");
  fs.writeFileSync(state, "{}");
  if (spec) fs.mkdirSync(path.join(dir, "spec"));
  if (unprocessed) fs.writeFileSync(path.join(dir, "UNPROCESSED"), "");
  if (page) {
    fs.mkdirSync(path.join(root, "docs", "concepts"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "concepts", `${slug}.html`), "<html></html>");
  }
  const t = new Date(NOW - ageDays * DAY);
  fs.utimesSync(state, t, t);
  return dir;
}

describe("sweepConceptStores", () => {
  test("removes orphans past their window: 7 days, a kept spec 30 days", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "concept-sweep-"));
    store(root, "old-orphan", { ageDays: 8 });
    store(root, "fresh-orphan", { ageDays: 2 });
    store(root, "spec-young", { ageDays: 20, spec: true });
    store(root, "spec-old", { ageDays: 31, spec: true });
    const removed = sweepConceptStores(root, NOW).sort();
    expect(removed).toEqual(["old-orphan", "spec-old"]);
    expect(fs.existsSync(path.join(root, ".claude", "concepts", "spec-young"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".claude", "concepts", "fresh-orphan"))).toBe(true);
  });

  test("keeps a live page's store, an UNPROCESSED one and the active concept's", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "concept-sweep-"));
    store(root, "live", { ageDays: 40, page: true });
    store(root, "unseen", { ageDays: 40, unprocessed: true });
    store(root, "active", { ageDays: 40 });
    expect(sweepConceptStores(root, NOW, "docs/concepts/active.html")).toEqual([]);
  });

  test("no store folder is a no-op", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "concept-sweep-"));
    expect(sweepConceptStores(root, NOW)).toEqual([]);
  });
});
