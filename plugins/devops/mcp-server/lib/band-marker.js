/**
 * Is the mod band drawing for THIS session, without Remote Control? (#2, d-detect)
 *
 * The band (hooks/mods) writes `<home>/.claude/devops-band-active.json`:
 *   { "sessions": { "<sessionId>": { "at": <epoch ms>, "remoteControl": true|false|null } } }
 * refreshed while it draws. The card tool minimizes its transcript widget only
 * when that session's entry is fresh AND remoteControl is exactly `false`.
 * Everything else — no file, unreadable, stale, other session, null/true
 * Remote Control, terminal/cloud (no band ever wrote it) — keeps the full card.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** An entry older than this is "not active": the band is gone or the session moved on. */
export const BAND_FRESH_MS = 30 * 60 * 1000;

export const BAND_MARKER_FILE = "devops-band-active.json";

/**
 * @param {unknown} sessionId the card's session_id
 * @param {{ home?: string, now?: number }} [opts]
 * @returns {boolean} true = the band carries the card, minimize the widget
 */
export function bandCarriesCard(sessionId, { home = homedir(), now = Date.now() } = {}) {
  if (typeof sessionId !== "string" || !sessionId || sessionId === "unknown") return false;
  try {
    const data = JSON.parse(readFileSync(join(home, ".claude", BAND_MARKER_FILE), "utf8"));
    const sessions = data && data.sessions;
    if (!sessions || typeof sessions !== "object" || !Object.prototype.hasOwnProperty.call(sessions, sessionId)) return false;
    const entry = sessions[sessionId];
    if (!entry || typeof entry.at !== "number" || !Number.isFinite(entry.at)) return false;
    const age = now - entry.at;
    if (age > BAND_FRESH_MS || age < -BAND_FRESH_MS) return false;
    return entry.remoteControl === false;
  } catch {
    return false;
  }
}
