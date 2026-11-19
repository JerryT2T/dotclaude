/**
 * Is the mod band drawing for THIS session, without Remote Control? (#2, d-detect)
 *
 * The band (hooks/mods) writes `<home>/.claude/devops-band-active.json`:
 *   { "sessions": { "<sessionId>": { "at": <epoch ms>, "remoteControl": true|false|null } } }
 * refreshed while it draws. The card tool minimizes its transcript widget only
 * when that session's entry is fresh AND remoteControl is not `true` (null =
 * unknown counts as off). Everything else — no file, unreadable, stale, other
 * session, Remote Control true, terminal/cloud (no band ever wrote it) — keeps
 * the full card.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * #1150: where the offline renderer (`--render-card`) leaves a session's card for the band:
 * `<home>/.claude/devops-band/card-<sessionId>.json`. The band (hooks/mods/format.ts bandCardFile)
 * reads it after the Bash call — a card that never passed the MCP tool still reaches the band.
 */
export function bandCardPath(sessionId, home = homedir()) {
  return join(home, ".claude", "devops-band", `card-${String(sessionId).replace(/[^\w.-]/g, "_")}.json`);
}

/**
 * #1150: store the card's band data (the `#dc-card-data` block) for the session. Best effort:
 * returns false (and writes nothing) without a usable session id, a text, or on a write error.
 */
export function writeBandCard(sessionId, text, { home = homedir(), now = Date.now() } = {}) {
  if (typeof sessionId !== "string" || !sessionId || sessionId === "unknown" || typeof text !== "string" || !text) return false;
  try {
    const file = bandCardPath(sessionId, home);
    mkdirSync(join(home, ".claude", "devops-band"), { recursive: true });
    writeFileSync(file, JSON.stringify({ writtenAt: new Date(now).toISOString(), text }) + "\n");
    return true;
  } catch {
    return false;
  }
}

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
    // Unknown (null) counts as "no Remote Control": neither the mod API nor get_session exposes it,
    // and a phone viewer still gets the answer + heading of the minimal widget (concept Etappe A close-out).
    return entry.remoteControl !== true;
  } catch {
    return false;
  }
}
