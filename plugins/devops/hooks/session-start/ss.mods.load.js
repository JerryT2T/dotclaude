#!/usr/bin/env node
/**
 * @hook ss.mods.load
 * @version 0.1.0
 * @event SessionStart
 * @plugin devops
 * @description Alpha feature `claude-mods`: makes a silent mod load failure visible.
 *   The devops mod (hooks/mods/index.tsx) writes its load marker
 *   ~/.claude/devops-mods-loaded.json at session.start. This hook keeps its own
 *   list of the sessions it saw (~/.claude/devops-mods-seen.json) and, at the
 *   next startup / resume / clear, asks Claude to show one line when the
 *   previous session ran without a marker (e.g. the Desktop load bug #105936).
 *   A compaction is no new session and checks nothing. Each missed session is
 *   reported once. The first run (no list yet) only records. File reads only,
 *   no git, no network: boot-window safe. Silent off alpha.
 */

require('../lib/plugin-guard');

const fs = require('fs');
const os = require('os');
const path = require('path');

const KEEP = 30;
/** A session shorter than this may have ended before the mod's session.start ran. */
const MIN_SESSION_MS = 60_000;

function home() {
  return process.env.DEVOPS_MODS_HOME || os.homedir();
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * The line for a previous session that ran without the mod, or null; and the
 * updated seen list. Pure: callers pass the files' content and the clock.
 * @param {{sid:string, source?:string, seen:{sessions:Array}, loaded:{sessions:Array}, now:number, lang?:string}} o
 */
function check({ sid, source, seen, loaded, now, lang = 'de' }) {
  const list = Array.isArray(seen && seen.sessions) ? seen.sessions.slice() : [];
  const marks = new Set((Array.isArray(loaded && loaded.sessions) ? loaded.sessions : []).map((s) => s && s.sid));
  let line = null;
  if (source !== 'compact') {
    const prev = [...list].reverse().find((s) => s && s.sid && s.sid !== sid);
    if (prev && !prev.reported && !marks.has(prev.sid) && now - Date.parse(prev.ts || '') >= MIN_SESSION_MS) {
      prev.reported = true;
      line = lang === 'en'
        ? `⚠ devops mod did not load in the last session (${String(prev.sid).slice(0, 8)}) → Spike 2 (#1100)`
        : `⚠ devops-Mod hat in der letzten Session nicht geladen (${String(prev.sid).slice(0, 8)}) → Spike 2 (#1100)`;
    }
  }
  if (sid && !list.some((s) => s && s.sid === sid)) list.push({ sid, ts: new Date(now).toISOString() });
  return { line, seen: { sessions: list.slice(-KEEP) } };
}

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { input += d; });
  process.stdin.on('end', () => {
    try {
      const hook = input.trim() ? JSON.parse(input) : {};
      if (!require('../lib/features').featureAllowed('claude-mods')) return process.exit(0);
      const dir = path.join(home(), '.claude');
      const seenFile = path.join(dir, 'devops-mods-seen.json');
      const firstRun = !fs.existsSync(seenFile);
      let lang = 'de';
      try { lang = require('../lib/locale').getLocale(hook.session_id); } catch { /* default */ }
      const r = check({
        sid: hook.session_id,
        source: hook.source,
        seen: readJson(seenFile, { sessions: [] }),
        loaded: readJson(path.join(dir, 'devops-mods-loaded.json'), { sessions: [] }),
        now: Date.now(),
        lang,
      });
      fs.writeFileSync(seenFile, `${JSON.stringify(r.seen, null, 1)}\n`);
      if (r.line && !firstRun) {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: `[ss.mods.load] Show the user this line verbatim in your first reply, once:\n${r.line}`,
          },
        }) + '\n');
      }
    } catch { /* best effort: never block a session start */ }
    process.exit(0);
  });
}

if (require.main === module) main();

module.exports = { check };
