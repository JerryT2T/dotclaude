# Pause and resume an open concept (#555)

Referenced from `SKILL.md` § 6c. A pause stops every process of an open concept and keeps the concept itself; a resume brings it back on the same port with every decision intact.

## Pause — stop everything, keep the concept

The user pauses in chat ("pausieren", "machen wir später weiter", "ist
pausiert"). Nothing is disposed, only the processes stop.

In this order — the waker treats an unexpected bridge exit as a signal, so it
goes before the bridge:

1. `TaskStop` the keepalive pulser and the pickup waker (their background task
   ids from Step 3 / the last resume).
2. `CronDelete <cron_id>` - only if the state file names a legacy cron.
3. Mark the state file, read-modify-write so owner, `baseline_sha` and every
   other field stay:
   ```bash
   node -e "const f='.claude/concept-active.json',fs=require('fs');const s=JSON.parse(fs.readFileSync(f,'utf8'));if(!s.owner||s.owner===process.argv[1]){s.paused_at=new Date().toISOString();fs.writeFileSync(f,JSON.stringify(s,null,2))}" "$OWNER"
   ```
4. `curl -s -X POST http://localhost:$PORT/shutdown > /dev/null 2>&1 || true`.

Keep the page, the decisions file, the durable store and
`concept-active.json`. While `paused_at` is set, `ss.concept.resume` prints a
one-line resume hint on every session start and compact and relaunches
nothing; the 24 h prune never touches a paused concept; the completion card
shows no concept link and no compass; strict mode bound to the concept is
released. End the pausing turn with the `paused` card, without a `concept`
field — its `[SESSION TITLE]` block sets `🟦 ➜ ✋ `.

## Resume offer after a restart (#1239)

Where the devops mod runs (feature `claude-mods`), a session start that finds
an unfinished concept with nothing pending and no bridge (dead with the last
session, or paused) relaunches nothing. `ss.concept.resume` writes
`.claude/concept-resume-offer.json` and the band shows one row: „Konzept
*<title>* ist noch offen (Runde N, zuletzt <time>). Fortsetzen?“ with
**Fortsetzen** (sends `Konzept <slug> fortsetzen`), **Später** (hides the row
for this session, keeps everything) and **Abschließen** (sends `Konzept <slug>
abschließen` → the Step 6 close-out). Fortsetzen = the resume below plus the
pending read and the page opened in the browser; delete the offer file first.
An unprocessed submission still takes the recovery path at once (it must not
wait for a click); without the mod the #348 relaunch and the paused hint stay.
In a Claude Projects thread there is no local state: the session-start
artifact hint is the source, and the thread's first reply after a restart
offers the same three choices with the artifact link.

## Resume from pause

Resume only when the user's prompt continues this concept ("weiter mit dem
Concept", "Concept fortsetzen", an answer about its open decisions). Any
other prompt leaves the pause alone — the hint is information, not a mandate.

1. Relaunch the bridge on the **same** port with the recorded `--html`
   (bridge-server-state.md step 4 — the command `buildDeadBridgeRelaunch` prints),
   verify the heartbeat round-trips, and re-arm the pulser, the waker and the
   no cron.
2. Rewrite the state file: delete `paused_at` and any legacy `cron_id`, set
   `started_at` = now and the new `server_pid`.
3. The earlier decisions come back from the durable store. End the turn with
   the `concept: { phase: "waiting" }` card; the compass returns.
