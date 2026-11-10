# Plans — ids, limits, thresholds

Single doc for the plan facts. The code source is `hooks/lib/plan.js`; a test
(`hooks/lib/plan.docs.test.js`) fails when this table and `plan.js` differ.
Other docs point here and do not repeat the numbers.

Official facts checked 2026-11-06 on [claude.com/pricing](https://claude.com/pricing),
the [Ultra article](https://support.claude.com/en/articles/17728952) and the
[Max article](https://support.claude.com/en/articles/11049741). The plugin
publishes no absolute token figures: Anthropic states none.

## Thresholds per plan

Class flips at `[5 h %, weekly %]` (`ask` = ask-before-parallel, `sonnet` =
sonnet-only). `Defer` is the 5 h fill at which the defer-to-reset question
appears. `Fill` is the minutes a ceremony needs to drain a 5 h window; it
scales the age at which a snapshot is refreshed. `Token guard` is the share
of the ~200K context window one operation may use before the guard asks.

<!-- plan-table:start -->
| id | Label | Capacity | Ask at | Sonnet at | Defer | Fill min | Token guard |
|---|---|---|---|---|---|---|---|
| free | Free | n/a | 0 / 0 | 70 / 85 | 70 | 30 | 5 % |
| pro | Pro | 1x | 0 / 0 | 70 / 85 | 70 | 30 | 5 % |
| max | Max | 5x | 80 / 90 | 95 / 98 | 80 | 150 | 8 % |
| ultra | Ultra | 10x | 90 / 95 | 98 / 99 | 90 | 300 | 10 % |
| team | Team | n/a | 80 / 90 | 95 / 98 | 80 | 150 | 8 % |
<!-- plan-table:end -->

Capacity is relative to Pro, per the pricing page. Free keeps Pro's
thresholds, Team (and Enterprise, which maps to `team`) uses Max's. An unknown
plan keeps the old behaviour: it asks before parallel work while no usage is
known, and classifies by Max's rules once usage is known.

## Names

The resolver `planId(raw)` accepts every form that was ever stored or sent:
`default_claude_max_20x`, `default_claude_max_5x`, `default_claude_pro`,
`Max 20x`, `Max 5x`, `max_20`, `max_5`, `max20`, `max5`, `Ultra`, `Max`,
`Pro`, `Free`, `Team`, `Enterprise`. "Max 20x" was renamed Ultra and "Max 5x"
is now "Max"; the API still sends `default_claude_max_20x` for Ultra.
`Max Plan` (the status line's placeholder) stays unknown. Stored files are
never rewritten: the burn calibration keeps its `Max 20x` key and the token
config keeps `"plan": "max_20"`; both are read through the aliases.

## The 5-hour limit

Free, Pro and Max have it. Ultra has none once the account is verified; an
unverified account has a temporary limit. Team and Enterprise: not stated, so
the plugin trusts the delivered data. `plan.js` `fiveHourState(id, value)`
decides: a delivered value is always used; `null` means "no limit" on Ultra
and "window idle" on every other plan.

At question time the injected `[budget]` line tells the two apart: with no
5h limit it shows only `week N%` (`budgetLine()` in `hooks/lib/budget.js`),
with one it shows `window N% · week N%`. do-run reads it to drop the resume
choice from its "PC danach" question (`skills/do-run/deep-knowledge/questions.md`
§ No 5h window).

## Fable

Fable is a model, not a plan feature. Pro and standard Team seats pay for it
with usage credits. Max, Ultra and premium Team seats may spend up to 50 % of
the weekly limit on Fable: the help articles call it a separate weekly limit,
but it is a share INSIDE the weekly pool, not extra quota — Fable use raises
both the Fable bar and the weekly bar, and drains the week faster than other
models. The plugin reads the share from the usage data (`limits[]` → the
card's `Fb` bar), not from the plan name, and never lowers the budget class
for it (the week already counts it). From `FABLE.blockAt` (85 %, `plan.js`)
the `[budget]` line adds `· Fable N% →`: no `fable` upgrades, a Fable
session is pointed to opus once (`budget.js` `fableSuffix`).

Fable 5.2 (2026-11-09): $8 / $40 per MTok (Opus 5.5: $4 / $20), 1M context,
thinking always on, Claude Code default effort medium. Anthropic positions
Opus 5.5 as the coding daily driver and Fable for open-ended work and as an
orchestrator / advisor over smaller models. Model routing: `agent-orchestration.md`
§ Fable. As of 2026-11-10 Max/Ultra hold one-time "Fable resets" from the
launch (they restore only the Fable share, used by hand in Claude); the plugin
does not track them.

Advisor (experimental, `advisorModel` setting): every subagent inherits the
session's advisor. SessionStart names a configured advisor once
(`hooks/lib/advisor.js`); nothing gates on it.
