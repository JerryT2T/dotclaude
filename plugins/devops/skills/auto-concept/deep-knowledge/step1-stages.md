# Step 1 — Etappen for unrelated topics

Read before round 1 of a concept whose request names several topics. The
markup and the engine of Etappen are in `templates-stages.md`; how to declare
them is in `step1-templates.md` § 1a · Design iteration authoring
(*Declaring them*).

## Unrelated topics → Etappen

**A concept whose request or open decisions span two or more topics that have
nothing to do with each other is staged by default: one Etappe per topic
group, declared in round 1 and worked through one after another** — whatever
started it (a direct prompt, a do-batch hand-off, another skill) and whatever
its mode (design, decision, mixed). Not one round that mixes them, and not the
topics as `data-design-set="topics"` sub-pages of one round.

- **The test, and the only one:** two topics are unrelated when no answer in
  one changes an option in the other. Shared ground that neither topic changes
  (design tokens, the navigation shell, global CSS, the same repo) does not
  relate them. Topics that fail the test — one screen family, variants of one
  component, a decision with its sub-questions — are not split by this rule;
  the optional dependent stages (`step1-templates.md` § 1a · Design iteration
  authoring, *Etappen (stages) — optional*) and the entangled-questions rule
  still apply to them.
- **An Etappe fills a round.** A topic group gets one when it needs mockups or
  a decision with alternatives to weigh. A small unrelated question (a yes/no,
  one pick) gets none: it is its own section in the Etappe closest to it, or
  in the last one. Fewer than two groups that fill a round → no Etappen.
- **More than seven groups** (stages are A–G): merge the smallest groups into
  one last Etappe and say so in round 1. An unrelated topic that comes up
  after round 1 joins the current Etappe as its own section — the stage list
  is not reopened.
- **The user's word wins.** A wish for one round, another order, or merged or
  dropped Etappen overrules this rule; say in round 1 that the order can be
  changed. Stages only advance (the gate refuses a step back), so a later
  correction to an earlier Etappe is its own section in the current round.
- **Never staged:** the final report, a reality-check round and a `--report`
  page carry no `data-stage`; they cover every Etappe.
- **Groups and order:** for a do-batch start the groups come from the hand-off
  (`step1-templates.md` § Step 0.5 · Asking, the do-batch start, count
  preferences — *Unrelated surfaces*); for every other start derive them from
  the request. The order is a reading order, not a dependency, and the
  implement order at the end stays ONE.
- **Declaring:** `concept-build.js init … --stages "A:Galerie,B:Login"` (a
  name holds no comma), every round section `data-stage="<id>"`.
