# Implement brief — Claude Code Mods for devops (concept 20261110-1935-claude-code-mods)

Decisions file: `docs/concepts/20261110-1935-claude-code-mods-decisions.json` (rounds 1–3, later rounds override).
Rounds: `docs/concepts/20261110-1935-claude-code-mods/rounds/01.html`, `02.html`, `03.html` (baked).
Implement order came from round 3: d3-plan = ok (Stufenplan stimmt), d3-channel = alpha, d3-scope = doc-stage1-spike1.

## User's words, verbatim

Round 1, general: none. Round 1 notes:
- d-cache-mode: „genau, und bitte limits und eher konservativ erstmal rangehen! und bitte mit geplant für den plugin entwickler mich einen check nach x zeit, ob das wirklich dwas gebracht hat!“
- d-new: „brnach hygiene aber gleich mit empefhlungsbutton, der das direkt in eneuer subsession oder wenns geht session startet mit korrekten mdoel und effort sinnvoll!“
Round 1 → round 2, general comment:
- „Super kritisch schaue, dass wir die qualität und dterminismus nicht mindern! Kritisch alles nochmal betrachen mit red team und co. Auch wie gut die mods laufen aktuell ob so welche schon möglich sind und lclaude code stabil genug dafür ist! Ansonsten nur in docs als concept festhaltene“
Round 2 note:
- d2-branch-model: „opus mittel!“ (Aufräum-Session: Opus · medium, overrides the ★ Sonnet · mittel)

## Hard constraints (non-negotiable — quality and determinism)

1. **No existing hook, guard, skill or MCP behaviour changes in this implement.** Stage 1 only DRAWS. Every
   shell hook keeps running exactly as today, with or without the mod. No stand-down logic in this implement.
2. `stop.flow.guard` stays the only authority on the completion card. The mod does not draw cards.
3. The mod is gated: feature `claude-mods`, `minChannel: "alpha"` in `plugins/devops/features.json`, registered
   per `docs/dev/feature-flags.md` (gate ALL find-points). Outside alpha the module registers nothing (or
   nothing visible). A failing mod is skipped silently by the engine → the plugin must work fully without it.
4. Ship the module inside the devops plugin (d2-pkg = inline): `plugins/devops/hooks/hooks.json` gets a
   `"modules": [...]` entry beside the existing `"hooks"`. hooks.json is GENERATED (`hooks/dispatch/build-hooks-json.js`
   + `manifest.json`, test in `dispatch.test.js` / `manifest.test.js` fails on drift) → add the modules key
   through the generator, not by hand. Docs confirm one hooks.json may hold both keys; `claude plugin validate`
   on such a plugin passed in a spike (CLI 2.1.302).
5. Deterministic only: no Haiku/model-generated text anywhere in stage 1. The only model call in this implement
   is Spike 1 (explicit, user-triggered slash command).
6. Mod tests: engine-backed tests with `claude plugin test <plugin folder>` (`*.test.ts` next to the module,
   `import { expect, test } from 'claude-code/testing'`). vitest only picks `plugins/**/*.test.js`
   (`vitest.config.mjs:24`) — add an npm script (e.g. `test:mods`) and wire it into CI only where the
   `claude` CLI is available (skip with a clear message otherwise). Keep `npm test` and `npm run lint` green.
7. Version gates: the Desktop engine here is 2.1.321, the CLI on PATH 2.1.302. Use only API present in both;
   the authoritative types are written by the engine at
   `C:/Users/Jeremy/AppData/Local/Temp/claude/bundled-skills/2.1.321/d4834d0c835ad6a1b8f3009d5a1660b8/plugin-authoring/types/claude-code.d.ts`
   (grep it; ~23k lines, never read whole) and the reference
   `…/plugin-authoring/reference.md` + examples `…/plugin-authoring/examples/{pane.tsx,band.tsx,tool-call.ts,pane.test.tsx}`.
   Module rules: ES module, no Node, no DOM, no dynamic `import()`, everything via `$`; JSX factory `h`;
   elements from `$.ui.resolve(e)`; `$.state` values declared in `types/index.d.ts` named in plugin.json `"types"`.
   Hook time limit 10 s. Timers/state that must survive a reload live in `$.state` (module vars reset on reload).
8. Never put usage numbers from memory into code; read them live (`session.measure` / `$.session.usage()`).
9. Budget data: one source. The band reads `session.measure` rateLimits; if it persists anything it writes the
   same `~/.claude/usage-live.json` shape `lib/budget.js:20-50` reads — never a second file. If writing is not
   clean, the band only displays and writes nothing.

## Checklist (one line per accepted item — every line needs evidence: file:line, test, screenshot)

Stage 0 — documentation
- [ ] C1 `docs/dev/mods.md`: the concept as a developer doc (English, per repo convention): stages 0–3, all
      decisions of rounds 1–3 with their why, the red-team findings and how each is handled, the cache math
      (Opus 5.5: read 0.05×, 1-h write 2×, break-even return probability H/39, worst case 2.5 % of a cold start per
      hour), the stability evidence (mods since 2.1.287 / 2026-10-01, issues #105936, #102330, #100083, remote
      kill switch, silent skip), surfaces table, and the open spikes 2–5. Link it from `CLAUDE.md` Architecture
      only if that file lists dev docs (keep CLAUDE.md minimal) and from `docs/dev/feature-flags.md` § Gated features.
- [ ] C2 `features.json` + `docs/dev/feature-flags.md` gated-features row for `claude-mods` (alpha, unreleased).

Stage 1 — display-only mods (module inside plugins/devops, hooks unchanged)
- [ ] C3 hooks.json `modules` entry via the generator; `claude plugin validate plugins/devops` passes.
- [ ] C4 Agent pane: a pane listing this session's subagents (type, model, elapsed, status) from agent events
      (`agent.spawn` / `$.agent.list`) — read-only.
- [ ] C5 Budget + context band (AbovePrompt or status line): 5-h and weekly percentUsed from `session.measure`,
      context fill; a hint to compact when the context is high. Display only (see constraint 9).
- [ ] C6 Toast (+ sound only if an asset can ship cleanly; else toast only and say so) when a permission request
      waits and when a long background run finishes. Additive — `perm.approval.watch.js` stays untouched.
- [ ] C7 Ship/CI pane: state of the current branch's PR checks / last ship step, read-only, from data that already
      exists (gh via `$.process` only if cheap and bounded; otherwise from files the ship pipeline writes).
- [ ] C8 Branch-hygiene status: open branches/worktrees count (from the data `ss.orphan.nudge.js` already
      computes) in the status line, plus a button that SUBMITS a fixed prompt to this session asking Claude to
      start the cleanup in a side session with model **opus**, effort **medium** (d2-branch = submit,
      d2-branch-model = „opus mittel!“). Fixed text, no model call in the mod. The button is display + prompt
      only; it is Spike 5 for the side-session part — document the result.
- [ ] C9 Notice toasts IN ADDITION to the existing "show verbatim" hook text (version notice, orphan nudge) —
      the hook text stays (red team #10).

Spike 1 — fork cache hit (the only model call)
- [ ] C10 A slash command (e.g. `/mods-spike-fork`, alpha-gated) that runs ONE `$.model.fork` with a tiny prompt
      and NO `effort` (setting effort can force a full cache write), and logs `usage.cache_read_input_tokens`,
      `cache_creation_input_tokens`, output tokens and the 5-h/weekly percentUsed before/after into
      `~/.claude/devops-mods-spike.jsonl`. Document in `docs/dev/mods.md` how to run it after a 50-min pause and
      what counts as pass (cache_read ≥ 95 % of the context, rate-limit delta negligible).

Tests and verification
- [ ] C11 `*.test.ts` engine tests for C4–C10 (render on desktop + terminal surfaces, gate off → nothing drawn,
      fork command logs the fields), run with `claude plugin test plugins/devops`; npm script; CI wiring as in
      constraint 6.
- [ ] C12 `npm test` and `npm run lint` green; no change in any existing hook's output (diff of hooks/ shows only
      the generated hooks.json `modules` addition and the generator change).

Issues (handled by the session via the auto-issue skill, NOT by builders)
- [ ] C13 Epic „Claude Code Mods“ + issues: Spike 2 desktop-load (#105936), Spike 3 title-writer, Spike 4
      concept-wake via `$.prompt.submit`, Spike 5 branch side-session button, and Stage 3 items: adaptive cache
      keep-alive (2 h, max 2 sessions, never opens a new 5-h window, cancels on input, disables after the first
      ping < 95 % cache read, payoff check as a scheduled task after 30 measured pauses / at most 14 days that
      reports to the plugin developer), titles, concept timers, recap (warm fork / cold from last card),
      deterministic paste + tool-output redirect (head/tail + path, never /do-run, AUTOSTART, `<command-name>`,
      test/git/CI exempt), stand-down marker per session with heartbeat, single budget source.

## Settled — never re-decide
d-arch→d2-pkg inline · d2-go display-only opt-in · d2-fixes all 8 (paste, tool, guard fast path dropped, card stays
with stop guard, notice toast additive, one budget source, per-session marker, plugin tests in CI) · d2-spikes order
fork-cache, desktop-load, title-writer, concept-wake, branch-button · d2-cache-start ramp · d2-cache-check pauses ·
d2-cache-first yes · d2-branch submit · d2-branch-model opus medium (note) · d2-recap hybrid · d3-channel alpha.
