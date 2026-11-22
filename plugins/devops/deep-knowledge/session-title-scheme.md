# Session Title Scheme

The session-title prefixes the devops plugin sets in the Desktop app sidebar, and how they match the completion card's CTA heading. Code: `hooks/lib/title-scheme.js` (the one table), `hooks/lib/session-title.js`, `mcp-server/lib/mode-state.js`. Card anatomy: `completion-card-design.md`.

A title reads `<STATUS> ➜ <ACTIVITY> <title>` (arrow U+279C between the status
and the activity emoji, one space around each). The sidebar title carries **no
keyword and no separator** (title-scheme 3.0, user decision 2026-11-22): the
room goes to the topic. Up to 2.8 it read `<STATUS> ➜ <ACTIVITY> <Word> ┃ <title>`
(heavy bar U+2503). The keyword lives on where there is room for it — the
completion card's CTA heading and the mod band (`👉 📦 Ready — Shippen?`) —
and both still come from the one table. Generic, unnamed work gets
`⏳ ➜ 🤖 <title>` (`WORK_PREFIX`, "Solo"), set by `prompt.flow.title-work` on
every prompt; the card's session-title note replaces it with the result prefix
at turn end. Nothing else strips or sets titles.

**Team = three robots.** With the keyword gone, Solo and Team would share
`⏳ ➜ 🤖`; pending background agents therefore read `⏳ ➜ 🤖🤖🤖` in the title
(`TITLE_ACTIVITY`, also `👉 ➜ 🤖🤖🤖` while an agent waits on an approval and
`🟥 ➜ 🤖🤖🤖` for an aborted team run). The card heading keeps `🤖 Team`.

**Shared heads.** States with the same status and activity share one title
head; only the card tells them apart: `👉 ➜ 📦` (Ready, Files), `👉 ➜ ⚠️`
(Red tests, Unverified, Not deployed), `🟩 ➜ 🚀` (Released Alpha / Beta /
Stable), `🟩 ➜ 🎊` (promoted Beta / Stable), `🟩 ➜ 📦` (Committed,
Delivered). `classify` needs none of these distinctions. The one clash across
categories was `👉 ➜ 🧪` — the Test outcome and a Testing run waiting on an
approval — so Testing left the approval swap (see below).

| STATUS | Meaning |
|---|---|
| `⏳` | Claude works (shipping, V&V running, background agents pending, concept iterating/implementing, generic Solo work) |
| `👉` | Your move: the card carries a MANDATORY user step, or something waits for your approval (question, plan, tool permission) |
| `🟩` | Done, nothing mandatory left (not ✅) |
| `🟥` | Aborted |
| `🟦` | Paused |
| `🔴` | Offline: the concept page lost its bridge (reboot, crash, app quit) — resume the session to reconnect |

| State | Title head (card keyword) |
|---|---|
| work | `⏳ ➜ 🚀` (Shipping), `⏳ ➜ 🧪` (Testing), `⏳ ➜ 🤖🤖🤖` (Team — pending background work: real agents only), `⏳ ➜ 🔗` (Linked — the parent's own work is done, marked side sessions, handoff or deliver, still run), `⏳ ➜ 🧭` (Concept — iterating/implementing), `⏳ ➜ 🤖` (Solo — generic) |
| user | `👉 ➜ 🧭` (Concept — page waits), `👉 ➜ 🔗` (Linked — a side session, handoff or deliver, waits on you), `👉 ➜ 📚` (Batch), `👉 ➜ 🧪` (Test), `👉 ➜ 📦` (Ready, Files), `👉 ➜ ❓` (Question), `👉 ➜ ⚠️` (Red tests, Unverified, Not deployed), `👉 ➜ 🚧` (Blocked), `👉 ➜ ⚡` (Interrupted, see F5) |
| done | `🟩 ➜ 🚀` (Released Alpha — merged ship; Released Beta / Stable — ship and promote in one run; a sub shows its true result too, `🔗 🟩 ➜ 🚀`), `🟩 ➜ 🎊` (Beta / Stable — promote only), `🟩 ➜ 📦` (Committed; Delivered — a side session delivered its part, the parent ships), `🟩 ➜ ✨` (Started), `🟩 ➜ 📊` (Analysis), `🟩 ➜ 🖥️` (System — work outside the repo); never "LIVE" |
| aborted | `🟥 ➜ 📦` (generic), `🟥 ➜ 🚀` (Ship), `🟥 ➜ 🎊` (Promote), `🟥 ➜ 🧪` (Test), `🟥 ➜ 🧭` (Concept), `🟥 ➜ 📚` (Batch), `🟥 ➜ 📊` (Analysis), `🟥 ➜ 🤖🤖🤖` (Team) |
| paused | `🟦 ➜ ✋` (Paused), `🟦 ➜ 🔋` (Limit), `🟦 ➜ 🔌` (Restart), `🟦 ➜ 💻` (Reboot) |
| offline | `🔴 ➜ 🧭` (Concept — set by `ss.title.sweep` only, see F5 after a crash) |

A named abort keeps its activity (`🟥 ➜ 🚀 X`).

## Side sessions

**The sub marker `🔗 `.** A *linked* side session (brief marker, or `user_asked` / `offer` without one — a task the user named counts as `[devops:handoff]`) keeps its full normal head and gets `🔗 ` in front of it: `🔗 ⏳ ➜ 🚀 X`, `🔗 👉 ➜ ❓ X`, `🔗 🟩 ➜ 🚀 X` (its true outcome, Released included), `🔗 🟥 ➜ 📦 X`, `🔗 🟦 ➜ 🔋 X`; a sub with its own subs reads `🔗 ⏳ ➜ 🔗 X`. An unmarked follow-up Claude proposes itself (`own_initiative` without marker) is independent: normal head, no `🔗`. The marker is no state: `title-scheme.js` (`SUB_MARK`, `withSubMark`, `carrySubMark`, `leadingPrefix` sees through it) keeps exactly one `🔗` through every status swap (title-work, question/restore, approval, interrupted, card). The session learns it is a sub from the brief marker in its FIRST user prompt (`subModeOfTranscript`, `side-sessions.js`; the card reads it through `isLinkedSub`, `mode-state.js`, the title-work hook from the prompt itself); `pre.ask.title` appends `[devops:handoff]` to a `user_asked` / `offer` brief without a marker so the new session can tell. The first time a session's title carries the `🔗` or its first prompt the marker, it is recorded per session (`rememberSub`, `<tmpdir>/dotclaude-devops-linked-sub-<session>`); from then on the title-work hook and the card (`isLinkedSub`) know it is a sub without either, so a title the app or the user reset gets its `🔗` back — also for a start with no brief (an offer with a title only, a `proposal_id` start). The `🔗 ` costs the topic two characters (`SUB_MARK_WIDTH`, `title-budget.js`): the topic is shortened, never the head.

**Side sessions.** Precedence for the parent, first match wins: own mandatory step (own diff, question, red tests; also a waiting concept page) → own `👉` head, no `🔗` > a linked side session waits on you (`👉 ➜ 🔗`, also over a working concept) > the parent's own running activity (concept iterating, shipping, background agents, testing) keeps its own `⏳` head and the running subs are only a `›` line > linked side sessions still running or paused (`⏳ ➜ 🔗`) > done. Both waiting states use the word `Linked` for handoff and deliver subs alike; `🤖 Team` names background agents only. The parent's last own result is a `›` line ("Eigener Teil committed, 2 Subs laufen"). Two brief markers: `[devops:handoff]` (child ships itself) and `[devops:deliver]` (child delivers, parent integrates and ships; here the parent's own diff does not win over `⏳ Linked`). Unmarked = independent follow-up: no status change, one `›` line — except a session started `user_asked` or `offer` (part of the user's request), which counts as `[devops:handoff]`. A note whose report says the work still runs ("läuft noch", "noch nichts gemergt") keeps the session running; only a done report closes it. The title is updated on every side-session note, a card only when the user's next move changes. An **archive notice** ("was archived by the user before it finished") counts as such a note: check its branch / PR — merged → `state: "shipped"`, otherwise `state: "archived"` — and render a new card in the same turn; an archived session never keeps a `⏳ Linked` title. A `⏳ Linked` card for running sessions always carries the `›` line "Für dich nichts zu tun — …" (`idleYou`), so the user knows at a glance whether to act, wait, or whether it is done. `🟩 Released` appears in the parent only after the last linked session finished (Released invites archiving the chat); a sub's own release shows in the sub's head and as a `›` line in the parent meanwhile.

**The topic (the text after the head).** Only the model names it, at most 30 characters (`TOPIC_MAX`, `hooks/lib/title-budget.js`; user decision 2026-11-17: "Nur das Modell", then "20 Zeichen" — raised to 30 on 2026-11-22, when the head lost its keyword and bar and the freed room went to the topic). The hook no longer derives a topic from the prompt's first line: on a session's first user prompt the app's own title stands (behind the prefix) until the model's first `set_session_title` replaces it, and the title-work instruction asks for a noun phrase naming the subject, not the prompt's opening words. Abbreviations are only a hint in that instruction ("abbreviations allowed, if needed") — no list, no project file; the limit is enforced instead: `pre.title.topic` refuses a `set_session_title` whose NEW topic is longer than 30 characters, once per topic, with the reason and the length, so the model shortens it itself. A call that keeps the current title's topic (status-prefix swaps by the card, concept, batch and ask hooks) is never refused, nor is a batch title (its skill owns it). A title the user set stays untouched. The hook-composed topics (card notes, ship) fit `TITLE_BUDGET` (42 characters after `<status> ➜ <icon> `; a Team head's two further robots take 4 of them, a sub's `🔗 ` 2).

**How early the ⏳ can appear.** Three paths, fastest first. A session started
with `start_session` that the parent links (a brief marker in any initiation — user_asked, offer, a proposal card, a start by `proposal_id` — or `user_asked` without one) carries the head, `🔗 ⏳ ➜ 🤖 <title>`, in the call itself
(`pre.ask.title`, `startSessionInput`, also for the non-blocking `own_initiative` proposal), so its row shows ⏳ before its process
boots. Not covered: a start by `proposal_id` without its own `title` (the card's title stays; the first prompt's hook adds the head and, from the brief marker, the `🔗`), and a cloud / SSH start (no title hook would clear the head). An unmarked offer / proposal is independent and gets its normal head from the hook. A session's first prompt gets it from the hook: `prompt.flow.title-work` answers
with `hookSpecificOutput.sessionTitle` (the prefix on the app's own title), applied before the first API call, when
the UserPromptSubmit dispatcher finishes (median ~2 s). Every later prompt goes
through `set_session_title` in the model's first tool batch. Limits: the app
adopts a hook title only while its own title is empty or app-generated
(`yieldsToProposedTitle`; a tool-set title wins, which is why later prompts need
the model), PostToolUse hooks cannot set a title, the transcript does not exist
yet during the first UserPromptSubmit hooks (the title comes from the hook
input's `session_title`), and no prompt-time hook can act while a slow SessionStart
dispatcher holds the first prompt back.

**A question mid-turn.** A call that waits for the user blocks the session
before any card — an `AskUserQuestion`, an `ExitPlanMode` plan approval, a
`start_session` other than `own_initiative` (an "offer" asks; "user_asked"
shows the app's approval card, even under bypass permissions) — so it carries
`👉 ➜ ❓` itself: `pre.ask.title` refuses the call once per turn
until a `set_session_title` to that head goes out in the same message, and
`post.ask.title` puts the ⏳ head back after the answer (a running ship keeps
`🚀 Shipping`). Rules: `hooks/lib/ask-title.js`.

**An approval waits → 👉, also for a background agent.** Whenever the user
must approve something (tool permission, plan, question) the status slot is
👉 — also while only a background agent waits on a tool permission dialog;
the activity stays: `⏳ ➜ 🤖🤖🤖 X` → `👉 ➜ 🤖🤖🤖 X`, and back to ⏳
once the dialog is answered (Solo alike: `⏳ ➜ 🤖 X` → `👉 ➜ 🤖 X`; a bare ⏳
counts as Solo). A running ship, a working concept, a batch, a Testing run
(since 3.0: `👉 ➜ 🧪` is the Test outcome) and every outcome keep their head. A worded
`👉 ➜ 🧪 Testing ┃ ` an older version left is still read as an approval and goes
back to `⏳ ➜ 🧪 `. Only the main thread can rename the session, so
`perm.approval.flag` (PermissionRequest, `asyncRewake`) wakes it with the
exact title, `perm.approval.watch` wakes it again for the ⏳ once
`post.approval.clear` / `substop.approval.clear` saw the agent move on. A
wake turn of an idle main thread is silent: the rename only — no text, no
card (a card would put the ⏳ back). Main-thread permission prompts are not
covered: the user already looks at that session's dialog. Rules:
`hooks/lib/approval-wait.js`, `title-scheme.js` (`approvalTitle`).

**The 👉-vs-🟩 rule** is decided by content, not by variant name: a
mandatory user step (an open point or question, a required userTest, a
requirement with `waitsOn: "user"`, red tests, unverified, blocked, ready
"Ship?", files, a concept waiting, a batch collecting, not deployed) gives
👉. Optional follow-ups (a promote offer after an alpha release, "noch
etwas?") stay 🟩. A `userFinalTest` item is mandatory unless it carries
`optional: true`: work that is done and verified, with only a look the user
may skip (a visual sanity check in the app), passes it as
`{ action, optional: true }` and keeps 🟩, because 👉 tells the user they
must act. A plain item is a check without which the work is not done.

**Title = CTA.** The card's CTA heading starts with the same status and
activity as the title and adds the keyword the title no longer spells
(`👉 ➜ 📦 X` → `👉 📦 Ready — Shippen?`; Team: `⏳ ➜ 🤖🤖🤖 X` →
`⏳ 🤖 Team — …`); both come from one table so they cannot drift.
The card's component line uses 🧩.

**F5 Interrupted.** A turn that ends WITHOUT a card while the title is
`⏳ ➜ 🤖 …` is rewritten to `👉 ➜ ⚡ <title>`. A batch turn without a
card, a concept waiting and `⏳ ➜ 🚀` stay untouched — except on a
card-less turn that answers a task notification while no background work of the
session is open (#833): then a Shipping / Team / Testing hourglass goes too, to the
last delegated ship result's `titlePrefix` in the transcript (e.g.
`🟩 ➜ 🚀 `), else to `👉 ➜ ⚡ `. A working concept
page stays.

**Limit stop.** `🟦 ➜ 🔋 Limit ┃ <title>` has three writers, because a turn
the usage limit cuts leaves no model turn to rename anything: the paused card
(`pause.reason: "usage-reset"`, when Claude stops before the limit), the mod
band (`markLimit` in `hooks/mods/index.tsx`: on a main turn whose whole answer
is Claude Code's "limit hit" line it renames its own session through the app's
session tools, no model turn — only a ⏳ title, a card's outcome stays), and
`ss.title.sweep` for sessions without a band (their transcript ends on the
limit record → Limit instead of Interrupted, also while the process lives).
The word is "Limit"; the older "Limit reset" is still recognised and stripped.

**F5 after a crash.** A killed process (app quit, crash, reboot) runs no Stop
hook, so its ⏳ title survives. `ss.title.sweep` (SessionStart of the next session
the user starts) finds sessions whose `custom-title.json` sidecar says ⏳, whose
transcript has been idle ≥ 2 min and whose governor pid is gone, and hands Claude
the exact old → new titles; Claude renames the ones `list_sessions` reports
`isRunning:false` to `👉 ➜ ⚡ <title>` — every ⏳ form. A concept
title (`👉 ➜ 🧭` or `⏳ ➜ 🧭`) whose bridge is gone becomes
`🔴 ➜ 🧭 <title>` instead, also without a crash of the session itself:
the bridge counts as alive only when `~/.claude/concept-bridges/<port>.json` names
the session's worktree (transcript `cwd`, or the #1090 watcher pointer), a live pid
and a `started_at` after the last boot — Windows reuses pids, so after a reboot every
entry is dead. No cwd known → the title stays. A prompt in that session strips 🔴
like any outcome, and `ss.concept.resume` relaunches the bridge. The scan runs detached, so the list arrives with a prompt
of that session, not with its start. Nothing runs before a session is started, and an
interrupted session asks nothing by itself: it waits for the user's next prompt.

**Dev servers are not pending work (#964).** A background command that never exits
by design — `ng serve`, `npm start` / `npm run dev` / `npm run serve` (also pnpm,
yarn, bun), `vite`, `next dev`, `python -m http.server`, and an `until …` loop
waiting on a server's ready line — is matched by command pattern
(`isDevServer` in `lib/pending-tasks.js`, next to the concept-bridge exception)
and never counts as open work. A command that also builds, tests or lints stays
work. So a card-less turn end whose only open background work is such a server
drops the ⏳ like any idle end. On resume, `ss.title.sweep` also hands on a ⏳
session whose governor pid is alive when its transcript has been idle ≥ 1 h with no
open work (servers excluded); Claude's `isRunning:false` check still has the last word.

**Legacy prefixes.** Titles in the wild may carry the worded head of
v0.297–v0.395 (`<STATUS> ➜ <ACTIVITY> <Word> ┃ `, e.g. `👉 ➜ 📦 Ready ┃ `,
`⏳ ➜ 🤖 Solo ┃ ` — the next prompt or card rewrites it to the current head, a
worded Solo head is re-marked instead of counted as "already marked"), the bar-first order of
v0.292–v0.296 (`<STATUS> ┃ <ACTIVITY> <Word> `, e.g. `👉 ┃ 📦 Ready `), the word-first order of
v0.287–v0.291 (`<STATUS> ┃ <Word> <ACTIVITY> `, e.g. `👉 ┃ Ready 📦 `,
`🟩 ┃ Started 💡 `), the older two-slot
form (`<STATUS> <ACTIVITY> <Word> – `, e.g. `👉 📦 Ready – `, with the old
keywords such as `Released Alpha` and the old `⏸️` status), the bare `⏳ `, or
an old single-icon prefix (`🚀 Shipped – `, `📦 Ready – `, `🧭 Concept – `,
`📥 Batch – `, `⏳ Working – `, …). All are still recognised and stripped
(also stacked, old and new mixed), and `classify` maps old and new forms to
the same categories. Matching ignores FE0F and any number of U+200A, so a
v0.287 title with its hair-space fill still matches. A status-less head
(`➜ 🚀 `, `➜ 🚀 Shipping ┃ `, or `┃ 🚀 Shipping ` of the bar-first order) is stripped
too: an older plugin takes the leading `⏳ ` for its bare prefix and stacks its
own in front (`⏳ 🧭 Concept – ➜ 🚀 X`).
Only known prefixes are stripped; `⏳ Fix Login – Bug` keeps its text. Since 3.0
every `<status> ➜ <known activity> ` counts as a head, whatever follows: a word
that only looks like a keyword (`🟩 ➜ 🚀 Released ┃ notes`) is topic text.

**Process prefixes outrank the hourglass.** Two prefixes name a running
process rather than an outcome: `⏳ ➜ 🚀 ` (the ship pipeline) and
`👉 ➜ 📚 ` (an armed collection). `⏳ ➜ 🤖 ` is the *fallback* for
"being worked on" — it is set only when no process prefix applies and it
never replaces one. `👉 ➜ 🧭 ` is no process but a wait: it says "your
move — look at the page", so whenever Claude works in a concept session
(generating the page, a user prompt, a picked-up submission, iterating,
implementing) the title is `⏳ ➜ 🤖 ` (or `⏳ ➜ 🧭 ` while
iterating), and the card brings 👉 back only for the `waiting` phase. **A
running ship outranks `concept.waiting` (#785):** while the title is
`⏳ ➜ 🚀 ` — also during a delegated ship in a subagent — a card that
does not end the ship (anything but `ship-successful`, `released`,
`ship-blocked`, `aborted`) leaves the title alone instead of restoring the
compass; the ship's own outcome card sets the next prefix. Only a task-notification turn leaves the compass
alone (it may end without a card). Concretely:
`prompt.flow.title-work` leaves `⏳ ➜ 🚀 ` / `👉 ➜ 📚 ` titles
untouched, and a prompt that *is* a ship (`hooks/lib/ship-intent.js`, the same
classifier `prompt.ship.detect` uses) is marked `⏳ ➜ 🚀 ` by the hook
itself, so `/do-ship` after a change never sits on `⏳` for the length of the
pipeline. Outcome prefixes (`🟩 ➜ 🚀 `, `👉 ➜ 📦 `, …) are what a new
prompt outdates — those the hook strips. Observed 2026-09-21.

**An outcome prefix lives exactly one turn.** `stop.flow.guard` hands the
title-work token back at every non-silent turn end — card or no card — so the
next prompt always marks `⏳ ➜ 🤖 ` and the card that ends that turn sets its own
outcome (`👉 ➜ 📦 `, `👉 ➜ 🧪 `, …). `🟩 ➜ 🚀 ` therefore stays on
the sidebar only while the LAST thing the session did was a ship; work after
a ship reads ⏳ → Ready/Test, never Released. (Until 0.183.9 the token was
released only after a card, and one card-less answer after a ship pinned
Shipped for the rest of the session.) A ship keyword is an order only in a
short prompt (`KEYWORD_MAX_CHARS` in `ship-intent.js`): long prose that
mentions a ship in passing is work, not a ship, and gets the Solo prefix.

**Machine turns keep the title (#1049).** A prompt nobody typed (task notification, channel message, a `<cross-session-message>` from another Claude session) is a machine turn (`isMachineTurn`, mirrored in `batch-state.js` MACHINE_PATTERNS): `prompt.flow.title-work` leaves every known prefix alone, so a peer's status question cannot turn a shipped session back to `⏳ ➜ 🤖`. Title bugs #956, #959, #964, #1049 share no code, only the shape: each state change is an advisory, model-relayed step, and a bug in its trigger leaves the title stale. Fix the trigger's classifier, and pin it with a test; eval case `evals/skills/session-title/`.

**The title family, analysed together (#956, #959, #964, #1049, #1048).** Same symptom, no shared defect:

| Report | What failed | Layer |
|---|---|---|
| #956 title stays 👉 after a waker pickup | `post.concept.title` gated on the waker's first poll, not on `processed_at` | gate timing |
| #959 title step skipped | merged UserPromptSubmit context over ~10 KB, the instruction was persisted to a file | transport |
| #964 title stays ⏳ | a dev server counted as open work (`pending-tasks.js`) | work classification |
| #1049 title lost on a peer message | `<cross-session-message>` was not a machine turn | prompt classification |
| #1048 | not a failure: earlier ⏳ via `sessionTitle`; it already skips machine turns | speed-up |

What they share is structure: every change but #1048's is an instruction the model relays, and no hook owns the title state. A state owner would be a redesign, so the class stays open; a new report is checked against this table first.
