# auto-harden — ship path specification

What `scripts/ship-harden.js` implements for `--invoked-by=ship` (`SKILL.md`
§ Ship path). The script is the behaviour; read this only to change it
(change both together) or when the script cannot run.

1. **Scope** = the files /do-ship passed, and inside them only the added or
   changed lines: `git -C <cwd> diff -U0 origin/<base>...HEAD -- <files>` plus
   the uncommitted diff of the same files (`<cwd>` = `--cwd`, else the
   session's cwd; the fixes of step 4 edit files under that same `<cwd>`). Deleted files and generated/vendor
   paths drop out. Empty → return `{ applicable: false, reason: "empty diff" }`.
2. **Static, inline, bounded.** Read the hunks, grep the added lines — no
   agents, no browser, no network, no test run (the ship's `ship_build`
   runs the suite on the result in its Step 2). Budget ~60 s and ≤ 40 files;
   beyond that check the 40 largest hunks and list the rest once as
   `skipped: <n> files (budget)`.
3. **Checks** (added lines only — pre-existing code is not a finding here):

   | id | Finding | Mechanical fix |
   |---|---|---|
   | H1 | focused test left in: `.only(`, `fit(`, `fdescribe(` in a test file — it silently disables the rest of the suite | drop `.only` / the `f` |
   | H2 | `debugger;` statement in source | delete the line |
   | H3 | secret-shaped literal (`(api[_-]?key\|secret\|token\|password)\s*[:=]\s*['"][^'"\s]{16,}`, a PEM header) | none — report FIRST |
   | H4 | empty catch without a comment (`catch {}`, `catch (e) {}`, `except: pass`) | none — the intent is unknown |
   | H5 | new skipped test (`.skip(`, `xit(`, `xdescribe(`, `@pytest.mark.skip`) | none |
   | H6 | timer or listener without cleanup in the same file (`setInterval` w/o `clearInterval`, `addEventListener` w/o `removeEventListener` in a long-lived module/component) | none |
   | H7 | new `TODO`/`FIXME`/`XXX`/`HACK` | none |

   A `mechanical` fix invents nothing: it only deletes what the finding names.
4. **Apply** the mechanical fixes — unless `$STRICT=1`, then apply none and
   report every finding (the ship's scope is what the user asked for; a
   drive-by line change is not).
5. **Return** to the caller and stop:
   `{ applicable, fixed: [{ id, file, line, change }], findings: [{ id, file, line, detail }], skipped: [...] }`.
   No completion card, no AskUserQuestion, no session-title change, no
   commit — /do-ship owns the turn and lands the fixes with the ship.
6. **Never blocks.** A finding is never a gate. The only red that stops a
   ship is a failing build/test in `ship_build` — and if one of THIS path's
   fixes caused it, /do-ship reverts that fix, re-runs the gate and reports
   the finding instead. A failing test the fixes did not cause is the
   ship's normal `ship-blocked`, not this path's verdict.
