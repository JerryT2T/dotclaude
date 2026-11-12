# Concept templates, part 42 of 50: Shared systems — final report panel, design system

## Final Report Panel

The final-report section closes a concept session. It is appended via the
implement-action branch of Step 5b (see `SKILL.md` § Final-report append) —
or it is the page's only round, when the Abschluss follows an implementation
without a concept before it (report-only entry, `concept-build.js init
--report`). The right-side panel switches to `panel-final-report` mode when
`showIteration()` detects `data-final-report` on the active section, and the
panel then belongs to the close-out alone:

- **Head:** the phase icon — **"🏁 Abschluss"** (`final.phase`) instead of the
  round label; on every normal round it reads **"🧭 Runde N"**
  (`[data-here-round][data-phase]`, § Tab Switch JS). Earlier rounds stay one
  click away through the head's 🕘 rounds chip.
- **No TOC window, no journey row, no status line** in the panel body
  (`body.viewing-final .panel-nav-scroll`, `.journey`, `.panel-status` are
  hidden). The body is the **to-do inbox** (`#closeout-sheet`).
- **Foot, under the divider:** the plan line, the quiet disposition line, the two
  ship buttons and "🔧 Nachbessern".
- **The panel starts closed behind ☰**, like on every round: the report is read
  first.

The sheet is deliberately **DOM-driven, not connection-driven**: it is
present because the section carries `data-final-report`, so it survives
reloads and stays fully visible even when the Claude heartbeat is stale.
A disconnected bridge only changes the buttons' label to "… · wird
zwischengespeichert".

**A final report is a document round.** Append it with
`data-iteration-template="free"` — never leave the attribute off (see
`resolveIterationTemplate()`, § Tab Switch JS) and never make it `design`.
The ☰ panel is page chrome and does not move with that choice.

### The close-out sheet — a to-do inbox

**Why an inbox.** The close-out panel went through four buttons at once, a
four-step wizard, a wall of every question, an accordion and a bottom sheet per
Fund whose pill looked like a menu but opened an overlay over half the panel.
What is actually left at the end of a concept is a short list of to-dos, most of
which Claude can pre-answer — so the panel shows exactly that, pre-answered, and
the click that confirms it is also the ship answer.

**Groups, top → bottom:**

| Group | Source in the report body | Row | Default |
|---|---|---|---|
| 🧭 **Du entscheidest** | the Funde: elements with `data-issue-title` inside `[data-open-questions]` (not `data-routed`) | ONE line: name · route pill | `data-route-default` (`now` / `issue` / `ignore`); missing → 📌 Issue (writes no code) |
| **Bleibt für dich** | `[data-tests] li` (🧪, what Claude could not verify) and `[data-handoffs] li` (👉, manual hand-offs), one list | kind glyph · text · "hoch" when `data-crit="high"`, then "Führ mich" switch · ✕ | `data-crit="low"` → struck (`skip`); else `data-guide="web"`/`"desktop"` (ONLY a guided action on a third-party site or system setting, never a manual check of the user's own app) → Führ mich on (`guide`); else on the card (`self`, the default). `data-mode-default` overrides |

- **A tap on the pill moves to the next route** (⚡ Jetzt → 📌 Issue → Weglassen →
  ⚡, `cycleRoute()`); focus stays on the pill, the plan line follows. The pill's
  tooltip says what the route does. ONE hint stands under all Funde
  (`#closeout-route-hint`).
- **A tap on the name jumps to the Fund in the report** (`jumpToFund()`): the 🔍
  fold opens and the Fund is marked for a moment. The report says what, where and
  why in the page's language; `data-issue-body` stays the English issue text and
  is never shown in the panel. The name is one line, ellipsis as a safety net.
- **More than three Funde:** three rows, "+N weitere" shows the rest
  (`#closeout-decide-more`). Every Fund keeps its own route and is in the payload.
- **A not-built item is a Fund** with `data-oq-origin="shortfall"`: it carries the
  ⚠ mark, is listed first, and the report body no longer repeats it.
- **"Führ mich" on** means Claude guides the step after the close-out: 🧭 Web-Guide
  (`web`), 🖥 Desktop-Hilfe (`desktop`) or 📄 Schritte im Chat (`inline`). The glyph
  and tooltip name the kind. **Off** means the item goes on the completion card.
  **✕ strikes it**, ↩ brings it back. **The UI never says "nicht führbar"** — Claude
  can always explain what to do.
- More than three of a kind: three rows plus "+N weitere im Bericht"; the rest keep
  their default and stay in the payload. Author at most three each.
- No group with nothing in it is shown; with no group at all the inbox says
  "Nichts mehr zu entscheiden — nur noch abschließen."

**Under the divider:**

- the plan line, re-rendered on every change: "⚡ 2 × jetzt umsetzen · 📌 1 ×
  Issue anlegen" (`renderCloseoutPlan()`), hidden when empty;
- the disposition as ONE quiet line with its default — **"🧹 Diese Seite wird
  gelöscht · ändern"** (`renderDisposeLine()`); "ändern" opens the radios +
  moveTo inline (`toggleDisposeEdit()`, `#panel-dispose-concept`);
- **two buttons, which ARE the ship answer:** **"🏁🚀 Abschließen & shippen"**
  (`#closeout-ship`, warning fill — the implement colour, no ⚠ glyph) and
  **"🏁 Nur abschließen, nicht shippen"** (`#closeout-noship`, ghost). Both
  submit `finalize` — `ship.run` true / false;
- **"🔧 Nachbessern"** (`#closeout-refine`, quiet): the result does not fit yet. It
  sends the user's notes on the report as `action: "refine"` (`submitRefine()`);
  without a note the 💬 dock opens instead. Nothing ships, nothing closes
  (`step5-finalize.md` § Nachbessern).

**Colour language** as in the concept rounds: warning = the actions that
write code or reach outside the repo (⚡ pill, the ship button), accent = the
issue route (📌 pill), neutral = Weglassen.

**Choices live in memory only** (`_closeoutChoices`); nothing on the sheet is
written to localStorage, because a remembered "⚡ Jetzt umsetzen" would sail
through a later close-out and write code nobody re-authorised. A reload falls back
to what Claude authored; a tab switch (`refreshCloseout({ reset: true })`) keeps
the choices by id. Rows are rebuilt only when the item SET changes (by key, never
by count), so a choice never tears its own row out from under the cursor or the
keyboard focus.

**After the click the clicked button is the status.**
`setCloseoutButtonState(state, which)` turns the clicked button into "⏳ Wird
abgearbeitet …" (submit and in-flight restore) or "⚠ Übermittelt · keine
Antwort mehr" (`markCloseoutStalled()`, plus the one hint paragraph — it
carries an instruction), and hides the others. What the user sees at the end is
the Fertig-Seite below.

### Fertig-Seite

The very last view of a concept tab, and deliberately not a document: viewport
filling and centred on the neural backdrop, a status ring, one word, one line, the
links, and what continues in the chat. It replaces report, panel and dock
client-side (`showFinished()`, `body.fin-on`), because the page file may be deleted
and the bridge gone.

| `state` | Ring | Heading | Under it |
|---|---|---|---|
| `shipped` | success ✓ | Fertig. | `sub`, e.g. "v0.360.0 auf Alpha, Concept abgeschlossen." "Live" only with a proven deploy |
| `closed` | accent ✓ | Abgeschlossen. | `sub`, e.g. "Nichts geshippt, alles liegt auf Branch X." |
| `partial` | warning ! | Fast fertig. | `sub` and up to three "Nicht erreicht: …" (`misses`), also when the ship was green |
| `blocked` | danger – | Ship blockiert. | `reason`, "Das Concept bleibt offen", and "Zum Bericht", because the sheet stays usable |
| `lost` | accent – | Verbindung weg. | "Das Ergebnis steht im Chat" and "Zum Bericht". The page sets this itself after a minute without a bridge during a finalize; never green |

**The result always comes from Claude**, never from a silent bridge or from
`ship.run`: `POST /status {"phase":"closed","finished":{…}}` (`step5-finalize.md`
§ D). Fields: `state`, `sub` or `reason`, `misses[]`, `links[]` (`{label, href}`,
http(s) only), `next[]`, `left[]`.

**The CTAs are the completion card's.** `links` are real links and the only
buttons: live version, PR, release, issues. `next` holds the labels of the card's
own actions (Promote, Fix, Nachbessern, …). Those need the chat's input field, so
they stand as labelled hints under "Weiter im Chat", never as a button that would
do nothing on a click. `left` is what is left for the user (at most three 👉/🧪
items): green without "Secret noch hinterlegen" would be untrue. Nothing else goes
on this page: no report, no bars, no budget, no pipeline line, no confetti.

**Payload:**

```json
{
  "submitted": true,
  "action": "finalize",
  "submission_id": "sub-…",
  "iteration": "3",
  "issues":    { "create": true, "items": [ /* 📌 */ ] },
  "implement": { "run": true,    "items": [ /* ⚡ */ ] },
  "ship":      { "run": true },
  "tests":     [ { "id": "t-mobile", "text": "…", "mode": "guide", "guide": "web" } ],
  "handoffs":  [ { "id": "h-cron",   "text": "…", "mode": "self",  "guide": null } ],
  "disposition": { "mode": "discard", "moveTo": null }
}
```

`mode` is `skip` | `guide` | `self`; `guide` is `web` | `desktop` | `inline`
for `mode: "guide"` and `null` otherwise.

`submitFinalize(shipRun)` requires the bridge's **durable ack**
(`body.durable`), not just a non-throwing fetch — a finalize can ship. On
transport failure it queues via the offline submit queue; on a non-durable
answer it hands the sheet back and warns.

**Lifecycle of the sheet's own state:**

| Moment | State |
|---|---|
| Submit | `setCloseoutFrozen(true)` — every control disabled, the clicked button reads "⏳ Wird abgearbeitet …", the other hides; `_submittedAt` set so `pollProcessedState()` tracks the round like any other submission |
| Reload while running | `restoreInFlightCloseout()` asks `/decisions`, re-freezes and picks the button from `ship.run` |
| Non-durable answer | `restoreCloseoutToReady()` — re-armed, warning shown; the payload is in the offline queue |
| Blocked ship / stuck round | `restorePanelToReady()` routes to `markCloseoutStalled()` for a delivered finalize — it must never un-hide `#panel-ready` |
| Successful close-out | `/status` `closed` + `finished` → the Fertig-Seite. Keep / gitignore: Claude also stamps `data-closed` and `data-finished='{…}'` on the section before the last `/reload`, so a reload shows the same page |

### Report body

**Budget: one screen at 1440 × 900, in one narrow column** (`--concept-read-width`,
shared with analysis, free and decision rounds; the page header is the only title). The build
blocks what breaks it (`validation-gate.md` 33d). Plain language on the whole
report surface; jargon, file paths and numbers only in the 🛠 fold. Top → bottom
(step5-update-page.md § Final-report append has the authoring rules):

1. **The page header** carries the concept's title with the "🏁 Abschluss" pill;
   the subtitle is hidden. After the close-out of a kept page the done banner
   `.fr-banner` opens the report.
2. **One sentence "Was getan wurde"** — `.fr-sentence`, at most 170 characters.
3. **`.fr-main`, two columns.** Left `.fr-results`: "Was kam raus" (`.fr-wins`, the
   top three functional results, each with its own glyph disc and one bold key
   phrase, at most 90 characters each) and the "▶ Selbst ausprobieren" button
   `.fr-try` (local / preview / live URL; after a ship "▶ Live-Version öffnen").
   Right `.fr-ba`: Vorher and Nachher share ONE place with a switch under it
   (`initBeforeAfter()`), the caption stands under the image, a click opens it full
   size. Nothing visual changed → a short `.fr-flow` there instead. **Login-gated
   route → § Try-it sign-in (#933).**
4. **"Was es aushält"** — `.fr-holds`: at most three requirement bars (below).
5. **Prüftiefe** — `.fr-depth`: visible at once, what passed last and what was not
   done next. The whole ladder is the tooltip (below). **Design implement (#935):**
   the parity checklist goes into the "🛠 Für Entwickler" fold as one line per
   checklist item with its parity status (`met` / `partial` / `unmet`) and the
   evidence (screenshot pair, sampled frame); every `partial` / `unmet` line is a
   Fund with `data-oq-origin="shortfall"`. A line counts as met only with that
   evidence, never on an agent's word.
6. **`.fr-folds`**, side by side: **"🔍 N Funde unterwegs"** (the Funde, per Fund was
   / wo / warum vorbelegt, the place the panel's names jump to) and **"🛠 Für
   Entwickler"** (at most five short lines: commit, areas + ≤ 3 key files, tests in
   one line, CI link). No other card or section: a "Nachtrag" goes into the 🛠 fold.

**Try-it sign-in (#933).** A try-it link to a route behind a login is worth
nothing when the user cannot sign in on exactly that origin — a second dev
port is not in the OAuth redirect allowlist, `127.0.0.1` is not `localhost`,
and no test account is named. Before writing `.fr-try` for such a route:

1. **Find the sign-in for that origin**, in this order: the project's
   auto-concept `reference.md` § Try-it sign-in (origin, login path, test
   account), the project's Local Test User (`{PLUGIN_ROOT}/deep-knowledge/test-strategy.md`
   § Local Test User), then the project's own auth config (OAuth redirect
   URIs, `.env.example`, seed users).
2. **Start the dev server on an origin that sign-in works on**: the
   allowlisted host spelling (`localhost` vs `127.0.0.1`) and the default
   port. Port taken by another checkout → say so instead of silently using a
   second port.
3. **Write one `.fr-try-auth` line under the button** (at most 110 characters) naming how to sign
   in there (account source, never a password in the page — name where it
   lives). No sign-in path works on that origin → no link, only the
   `.fr-try-auth` note saying what is missing ("OAuth nur auf
   localhost:4200 — Port belegt").

The same rule holds for a URL in the completion card's `userTest` /
`userFinalTest` steps (`{PLUGIN_ROOT}/deep-knowledge/completion-card-design.md`).

**Requirement bars** (`.fr-meter`): one per requirement, the three most relevant
of seven classes — Performance, Sicherheit, Stabilität, Datenintegrität,
Kompatibilität, Barrierefreiheit, Wartbarkeit (a login topic weighs security, most
others performance). **The bar is a grade: how far this requirement was met.**

| `data-grade` | `--fr-fill` | Colour, glyph | Meaning |
|---|---|---|---|
| `full` | 100 % | green ✓ | requirement met |
| `part` | 60–99 % | amber ▲ | partly met |
| `low` | under 60 % | red ✕ | clearly missed |
| `open` | 0 % (dashed) | grey ? | not tested, whatever the code suggests |

The fill is the share of the requirement that was reached, capped at 100 %: for a
limit, 100 % once the measured value is within it, else limit ÷ measured; for a
coverage, covered ÷ all. **Claude always estimates the requirement itself** and
says so in the tooltip. One row: name, bar, the measured value. The context
sentence is the row's `data-tip`.

**Prüftiefe** (`.fr-depth`): the level that passed last (✓) and the next level not
done (○), named outright, because "letzte Stufe" is what a reader wants without
hovering. The levels: 1 Code-Check (Lint/Typen) · 2 Trockentest (Unit) ·
3 Zusammenspiel (Integration/E2E lokal) · 4 Lokal durchgespielt (echter
Browser/App) · 5 Prod-Build geprüft · 6 Live vertestet (Staging/Prod) · 7 Von
dir abgenommen. A level that does not apply is skipped. The whole list with its
states is the `data-tip`; test counts live in the 🛠 fold.

**No checkboxes in the report body.** The Funde are plain `<li>` elements;
the FAB is the only place to answer. After the close-out the body shows what
became of each Fund (issue link / "umgesetzt").

### Final-report section HTML

```html
<section id="iter-3" data-iteration="3" data-iteration-template="free" data-final-report data-active>
  <!-- After the close-out of a kept page, first in the section:
  <div class="fr-banner">🏁 {{final.banner_done}} · 🚀 {{final.banner_live}}<em>21:40</em></div> -->
  <p class="fr-sentence">Die API meldet jetzt per Token an statt per Session-Cookie, und abgelaufene Tokens erneuern sich von selbst.</p>

  <div class="fr-main">
    <div class="fr-results">
      <p class="fr-label">{{final.results}}</p>
      <ul class="fr-wins">
        <li><span class="fr-win-icon" aria-hidden="true">🔑</span><span><b>Ein Login</b> reicht für Web und App.</span></li>
        <li><span class="fr-win-icon" aria-hidden="true">♻️</span><span>Abgelaufene Tokens <b>erneuern sich still</b>.</span></li>
        <li><span class="fr-win-icon" aria-hidden="true">🚪</span><span><b>Abmelden</b> wirkt sofort auf allen Geräten.</span></li>
      </ul>
      <a class="fr-try" href="{try-it URL on the sign-in origin}" target="_blank" rel="noopener noreferrer">▶ {{final.try_it}}</a>
      <!-- after a ship: ▶ {{final.open_live}} -->
      <!-- Login-gated route only (#933) — how to sign in on exactly this origin: -->
      <p class="fr-try-auth">🔑 Testkonto aus <code>docs/test-accounts.md</code></p>
      <!-- No sign-in works on that origin → no link, only the note:
      <p class="fr-try-auth">🔑 OAuth erlaubt nur localhost:4200, der Server läuft auf :4201</p> -->
    </div>
    <div class="fr-ba" data-label-before="{{final.before}}" data-label-after="{{final.after}}">
      <figure class="fr-shot"><img src="{date}-{slug}/shots/before.png" alt=""><figcaption>Login mit Session-Cookie</figcaption></figure>
      <figure class="fr-shot"><img src="{date}-{slug}/shots/after.png" alt=""><figcaption>Login mit Token</figcaption></figure>
    </div>
  </div>

  <div class="fr-holds">
    <p class="fr-label">{{final.holds}}<small>{{final.holds_hint}}</small></p>
    <div class="fr-meters">
      <div class="fr-meter" data-grade="full" style="--fr-fill: 100%" data-tip="Keiner von 40 gefälschten Tokens kam durch; Anforderung 0 (geschätzt).">
        <span class="fr-meter-name">🛡 Sicherheit</span>
        <div class="fr-meter-bar" aria-hidden="true"></div>
        <b class="fr-meter-value">0 / 40</b>
      </div>
      <div class="fr-meter" data-grade="part" style="--fr-fill: 86%" data-tip="140 ms bis zur Anmeldung; Anforderung unter 120 ms (geschätzt).">
        <span class="fr-meter-name">⚡ Performance</span>
        <div class="fr-meter-bar" aria-hidden="true"></div>
        <b class="fr-meter-value">140 ms</b>
      </div>
    </div>
  </div>

  <div class="fr-depth" tabindex="0" data-tip="5 / 7 · ✓ {{final.level_code}} · ✓ {{final.level_dry}} · ✓ {{final.level_interplay}} · ✓ {{final.level_local}} · ✓ {{final.level_prod}} · ○ {{final.level_live}} · ◌ {{final.level_accept}}">
    <span class="fr-depth-done">✓ {{final.depth_done}}: <b>{{final.level_prod}}</b></span>
    <span class="fr-depth-next">○ {{final.depth_next}}: <b>{{final.level_live}}</b></span>
  </div>

  <div class="fr-folds">
  <!-- The Funde — out-of-scope finds, points the user parked, and what could not
       be built. NO checkboxes: plain <li> carrying the data the 🧭 group and the
       payload read. Mandatory: data-oq-id, data-issue-title, data-issue-type,
       data-oq-origin ("deferred" | "found" | "shortfall"), data-route-default
       ("now" | "issue" | "ignore") and data-route-reason (one word). -->
  <details class="fr-fold" data-open-questions>
    <summary>🔍 2 {{final.funde_fold}}</summary>
    <ul class="fr-funde">
      <!-- Visible label (.oq-label): a short noun phrase of AT MOST 28 characters —
           the panel shows one line. The text of a 🧪 / 👉 item: at most 48 (two
           lines). Details belong in .fr-fkv and data-issue-body. The gate blocks a
           longer one (validation-gate.md 33c). -->
      <li data-oq-id="oq-wizard"
          data-issue-title="[FEATURE] Add the backup step to the wizard"
          data-issue-type="feature"
          data-issue-body="Approved in round 2, not built: the wizard has no step type for it yet."
          data-oq-origin="shortfall"
          data-route-default="now"
          data-route-reason="nicht-gebaut">
        <span class="oq-label">Backup-Schritt fehlt</span>
        <dl class="fr-fkv">
          <dt>{{final.fund_what}}</dt><dd>Nicht umgesetzt, weil dem Wizard der Schritt-Typ fehlt.</dd>
          <dt>{{final.fund_where}}</dt><dd>Einrichtungs-Wizard</dd>
          <dt>{{final.fund_why}}</dt><dd>⚡ Jetzt — ein zweiter Anlauf kann gelingen.</dd>
        </dl>
      </li>
      <li data-oq-id="oq-saml"
          data-issue-title="[BUG] Auth fails for SAML users"
          data-issue-type="bug"
          data-issue-body="During the smoke test of the new middleware, SAML logins failed with 'invalid assertion'. Out of scope (the concept covered OIDC only). Reproduce: log in via the SAML IdP in staging."
          data-issue-module="auth"
          data-oq-origin="found"
          data-route-default="issue"
          data-route-reason="riskant">
        <span class="oq-label">SAML-Login schlägt fehl</span>
        <dl class="fr-fkv">
          <dt>{{final.fund_what}}</dt><dd>SAML-Anmeldung bricht mit „invalid assertion“ ab.</dd>
          <dt>{{final.fund_where}}</dt><dd>Staging, SAML-Anbieter</dd>
          <dt>{{final.fund_why}}</dt><dd>📌 Issue — riskant, berührt einen fremden Anbieter.</dd>
        </dl>
      </li>
    </ul>
  </details>

  <details class="fr-fold">
    <summary>🛠 {{final.dev_fold}}</summary>
    <ul class="fr-dev">
      <li>Commit <code>a1b2c3d</code> · Bereiche: auth, api</li>
      <li><code>src/auth/middleware.ts</code>, <code>src/auth/refresh.ts</code>, <code>src/api/client.ts</code></li>
      <li>Tests: 412 grün, 1 übersprungen (SAML, s. Funde)</li>
      <li>CI: <a href="https://github.com/{owner}/{repo}/actions/runs/123">Lauf #123</a></li>
    </ul>
  </details>
  </div>

  <!-- 🧪 what Claude could not verify, 👉 what the user does by hand after
       the merge. Data for the FAB only (hidden): at most three each, one short
       line, data-crit = low | mid | high, data-guide = web | desktop only for a
       guided action on a THIRD-PARTY site or system setting (API key, OAuth
       app, account, hosting secret, terms, OS setting); trying / testing /
       viewing the user's own app or site is always "" (default, off). Omit a list that would be empty. -->
  <section data-tests hidden aria-label="{{final.group_tests}}">
    <ul>
      <li data-todo-id="t-mobile" data-crit="mid" data-guide="">Login auf dem Handy ansehen</li>
    </ul>
  </section>
  <section data-handoffs hidden aria-label="{{final.group_handoffs}}">
    <ul>
      <li data-todo-id="h-secret" data-crit="high" data-guide="web">Neues Token-Secret im Hosting-Dashboard hinterlegen</li>
    </ul>
  </section>
</section>
```

### Fund attributes

| Attribute | Required? | Purpose |
|---|---|---|
| `data-oq-id` | yes | Stable identifier, returned as the payload item's `id` (a legacy `name`/`id` still works) |
| `data-issue-title` | yes | Verbatim `gh issue create` title (`[TYPE] Imperative title`). Marks the element as a Fund for `openQuestionBoxes()` |
| `data-issue-type` | yes | Issue label (`bug`, `feature`, `refactor`, `chore`, `docs`, `design`); defaults to `chore` |
| `data-oq-origin` | yes | `deferred` (the user parked it during this concept), `found` (surfaced on the way, unrelated to the scope) or `shortfall` (approved scope that could not be built; list these first). Nothing else is admissible (`SKILL.md` § Open points admission gate; validation gate 33b) |
| `data-route-default` | yes | Claude's pre-selection: `now` (⚡) / `issue` (📌) / `ignore` (✕) — the rules are in step5-update-page.md § Funde defaults. Missing → 📌 Issue |
| `data-route-reason` | yes | ONE word for the reason, shown in the report's "Warum vorbelegt": `klein`, `riskant`, `braucht Concept`, `außerhalb Repo`, … |
| `data-issue-body` | recommended | The issue body (English artefact, never shown in the panel) — the context someone needs to act on it cold |
| `data-issue-role` / `-module` / `-milestone` | optional | Project label hints, honoured only when they exist |
| `data-routed` | set by Claude | Added with the issue link / "umgesetzt" note once the Fund is routed; drops it from the 🧭 group |

**🧪 / 👉 item attributes:** `data-todo-id` (stable id), `data-crit`
(`low` / `mid` / `high`), `data-guide` (`web` / `desktop` only for a third-party / system action, otherwise empty — the default),
optional `data-mode-default` (`skip` / `guide` / `self`); Claude stamps
`data-mode` with the user's choice when it processes the finalize. Plain text
inside (or a `.todo-text` span when the `<li>` carries more markup).

### After a Fund is routed — HTML rewrite pattern

When Claude processes a `finalize` payload it rewrites every routed `<li>` so
the body says what became of it — `data-routed` plus an issue link (📌) or an
"umgesetzt" note (⚡); a dropped Fund gets `data-routed` and no note:

```html
<li data-oq-id="oq-saml" data-issue-title="[BUG] Auth fails for SAML users" data-issue-type="bug"
    data-oq-origin="found" data-route-default="issue" data-route-reason="riskant" data-routed>
  <span class="oq-label">SAML-Login schlägt fehl</span>
  <a class="oq-issue-link" href="https://github.com/{owner}/{repo}/issues/123"
     target="_blank" rel="noopener noreferrer">{{final.issue_link_prefix}} #123</a>
</li>
<li data-oq-id="oq-typo" data-issue-title="[CHORE] Fix the outdated login hint text" data-issue-type="chore"
    data-oq-origin="found" data-route-default="now" data-route-reason="kosmetisch" data-routed>
  <span class="oq-label">Veralteter Hinweistext am Login</span>
  <span class="oq-done">✓ {{final.done_prefix}} — <code>src/auth/LoginHint.tsx</code></span>
</li>
```

Once every Fund carries `data-routed`, the 🧭 group drops out by itself.
Rendering runs client-side only — Claude never adds or removes a group via the
bridge; it controls them through the body markup.

### Disposition Control

The disposition fieldset (`#panel-dispose-concept`) sits behind the 🧹 line's
"ändern" — always present, its default stated on the line. Its three radios +
optional `moveTo` text input drive Step 6 cleanup behaviour.

| `mode` | Step 6 cleanup behaviour |
|---|---|
| `discard` *(default)* | Delete the concept HTML, the matching `-decisions.json` AND its source folder `{date}-{slug}/` from `docs/concepts/`. |
| `keep` | Leave the files in place (or under `moveTo` if set). They remain git-tracked. |
| `gitignore` | Leave the files in place (or under `moveTo` if set) AND append `docs/concepts/{date}-{slug}.*` plus `docs/concepts/{date}-{slug}/` (or the moved paths) to the repo's `.gitignore` if not already covered. |

**Optional `moveTo` (string):** a target directory (e.g.
`docs/architecture/decisions/`). When set, Claude `mv`s the HTML file AND the
decisions JSON there FIRST, then applies the `mode`. Empty input is null.

```json
{ "mode": "discard" | "keep" | "gitignore", "moveTo": "docs/architecture/" | null }
```

**Backward compatibility:** a submission without a `disposition` field
defaults to `{ mode: "discard", moveTo: null }`; one without `tests` /
`handoffs` means there were none.

### One submission, four consequences

`finalize` is a single submission that can carry up to four real actions.
Claude executes them in a fixed order — **issues → implement → ship → Step 6
cleanup** — and then hands over the 🧪/👉 items by their mode (step5-finalize.md):

- Issues first, because they are cheap, local to GitHub, independent of
  everything else, and their creation must not depend on a release
  succeeding. A run that dies later still leaves the follow-ups tracked.
- Implement second (the Funde routed to ⚡), because a release must contain
  that work rather than predate it.
- Ship third, because it is the one part that can hard-fail on a gate. When it
  does, Claude stops there: created issues and implemented follow-ups stand,
  **cleanup does not run**, and the concept session stays open so the user can
  retry.
- Cleanup last, because `discard` deletes the concept HTML — doing that before
  the outward-facing steps would destroy the record while it is still needed.

**Replay protection is on the bridge, not just the page.** The `_version`
mismatch guard only exists on `POST /reset` and `POST /status` — `POST
/decisions` has none, it just creates a new version and flips `/pending`. So a
finalize whose response was lost in transit after the bridge had already
fsynced it sits in BOTH places, and the offline queue would happily deliver it
again: duplicate `gh issue create`, a second real release, `discard` applied
twice. That is why every payload — finalize, iterate, implement — carries a
`submission_id`. `retryPendingSubmission()` compares it against what
`/decisions` already holds before re-POSTing (see § Offline Submit Queue), and
`concept-server.py`'s `POST /decisions` remembers every `submission_id` it has
journalled (a bounded ring, derived from `journal.jsonl` on restart too) and
answers a repeat with `{"ok": true, "durable": true, "duplicate": true}`
WITHOUT touching `_decisions`, `_version` or the pending marker. Do not drop
the `submission_id` field, do not "simplify" the retry, and do not treat the
client-side check as sufficient on its own.

## Design System

### Colors
- Dark mode: `#0d1117` background, `#c9d1d9` text, `#58a6ff` accent
- Light mode: `#ffffff` background, `#24292f` text, `#0969da` accent
- Success: `#3fb950` / `#1a7f37`
- Warning: `#d29922` / `#9a6700`
- Danger: `#f85149` / `#cf222e`

### Typography
- System font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Headings: 600 weight, tight letter-spacing
- Body: 400 weight, 1.6 line-height
- Code: `'Cascadia Code', 'Fira Code', monospace`

### Spacing
- Section gap: `2rem`
- Card padding: `1.5rem`
- Element gap: `0.75rem`

### Interactive Elements
- Toggle switches: 44px wide, smooth transition, clear on/off state
- Checkboxes: custom styled, visible check mark
- Comment fields: `width: 100%` within their container, `min-height: 80px`,
  auto-expanding textarea
- Text inputs: `width: 100%` within container, generous padding (`0.75rem`)
- Submit button: in decision panel, full-width within panel
- Sliders: labeled endpoints, current value display, full container width
