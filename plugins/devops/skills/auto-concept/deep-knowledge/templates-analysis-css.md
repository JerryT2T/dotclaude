# Concept templates, part 44 of 48: Template: analysis — styling CSS (Full + Lite)

## Styling (Full + Lite)

Everything is namespaced: tokens `--an-*`, classes `an-*`, and the authored
attributes only ever below `[data-analysis]`, so no rule can reach engine
chrome (gate P32 watches `<style>` blocks in rounds; this block is engine CSS
and keeps the same discipline). Dark is the default, `html[data-theme="light"]`
swaps the tokens. Status colours (green done, orange deviation, light-blue
issue) appear only in the rail, the closing and the tags; topic colours
(`--c`, assigned in JS) are strongly different per topic and never blue (that is
briefing / closing), never the note purple, never the concept variant colours,
never red, green or orange; analysis figures are
neutral / light blue.

```css
[data-analysis] {
  --an-bg: #0d1117; --an-s1: #151b23; --an-s2: #1b2230; --an-s3: #252d3b;
  --an-bd: rgba(240,246,252,.08); --an-bd2: rgba(240,246,252,.15);
  --an-tx: #f0f6fc; --an-tx2: #c9d1d9; --an-mu: #9198a1; --an-mu2: #6e7681;
  --an-ac: #2f81f7; --an-ac-soft: rgba(47,129,247,.14);
  --an-ok: #3fb950; --an-ok2: #7ee787; --an-warn: #d29922; --an-gold: #f2cc60;
  --an-li: #79c0ff; --an-li-soft: rgba(121,192,255,.1);
  --an-on-ac: #fff; --an-shadow: 0 12px 34px rgba(0,0,0,.35);
  --an-dur: 300ms;
  color: var(--an-tx); font-size: 14px; line-height: 1.5; text-align: left;
}
html[data-theme="light"] [data-analysis] {
  --an-bg: #ffffff; --an-s1: #f6f8fa; --an-s2: #eef1f5; --an-s3: #e1e6ec;
  --an-bd: rgba(31,35,40,.1); --an-bd2: rgba(31,35,40,.22);
  --an-tx: #1f2328; --an-tx2: #3d444d; --an-mu: #59636e; --an-mu2: #818b98;
  --an-ac: #0969da; --an-ac-soft: rgba(9,105,218,.1);
  --an-ok: #1a7f37; --an-ok2: #1a7f37; --an-warn: #9a6700; --an-gold: #9a6700;
  --an-li: #0969da; --an-li-soft: rgba(9,105,218,.08);
  --an-shadow: 0 10px 28px rgba(31,35,40,.14);
}
[data-analysis] *, [data-analysis] *::before, [data-analysis] *::after { box-sizing: border-box; }
[data-analysis] :where(p, h3, h4, ol, ul) { margin: 0; padding: 0; }
[data-analysis] :where(ol, ul) { list-style: none; }
[data-analysis] :where(button) { font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer; text-align: inherit; line-height: inherit; }
[data-analysis] :where(button, [tabindex], input, textarea):focus-visible { outline: 2px solid var(--an-ac); outline-offset: 2px; }
[data-analysis] kbd { display: inline-flex; align-items: center; height: 21px; padding: 0 6px; border-radius: 5px; background: var(--an-s3); font: 600 11.5px ui-monospace, Consolas, monospace; color: var(--an-tx); }

/* ---------- chat flow: ONE centred column (max 780 px), every stage a vertical message flow ---------- */
[data-analysis] { --c: #79c0ff; --an-b1: #58a6ff; --an-b2: #79c0ff; --an-b3: #a5d6ff; --an-b4: #388bfd; }
.an-enh { position: relative; display: block; max-width: 780px; margin: 0 auto; padding: 40px 24px 36px; }
.an-enh [data-topic] { display: contents; }
.an-enh .an-off { display: none !important; }
.an-enh [data-alevel], .an-stores { display: none; }
.an-stage { min-width: 0; outline: none; }
.an-lite { max-width: 860px; margin: 20px auto 74px; border-radius: 18px; background: linear-gradient(180deg, var(--an-s1), var(--an-bg)); border: 1px solid var(--an-bd2); box-shadow: var(--an-shadow); padding: 4px 22px 28px; }
/* design view kind `analysis`: the view itself is the (scrolling) Lite card */
section[data-view][data-view-kind="analysis"] { overflow-y: auto; }
section[data-view].an-lite { max-width: none; margin: 0; border: 0; border-radius: 0; background: none; box-shadow: none; padding-left: max(2rem, calc((100% - 860px) / 2)); padding-right: max(2rem, calc((100% - 860px) / 2)); }
.an-enh[hidden], [data-analysis] [hidden] { display: none !important; }
/* the hidden storage target of the composer (the stage's data-comment note) */
.an-vh { position: absolute; width: 1px; height: 1px; margin: 0; padding: 0; border: 0; opacity: 0; overflow: hidden; clip-path: inset(50%); pointer-events: none; }
.an-att { margin-top: 6px; }
.an-att .attach-btn { display: none; }

/* ---------- messages: devops avatar left, only the CURRENT message glows ---------- */
.an-msg { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 12px; margin-top: 16px; transition: opacity .18s ease; }
.an-av { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; color: #0d1117; background: linear-gradient(135deg, var(--an-b2), var(--an-b4)); }
.an-av svg { width: 18px; height: 18px; }
.an-m-q .an-av { box-shadow: 0 0 14px rgba(121,192,255,.65), 0 0 2px rgba(121,192,255,.9); }
.an-bub { min-width: 0; padding: 14px 18px; border-radius: 4px 18px 18px 18px; background: var(--an-s1); cursor: default; }
.an-edge { border-left: 3px solid var(--c); }
.an-meta { margin-bottom: 6px; font-size: 11.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--c); }
.an-dip { opacity: 0; }
.an-pane { min-width: 0; }
.an-pane:not([hidden]) { animation: an-fade .32s ease-out both; }
.an-pane > * + * { margin-top: 12px; }
[data-analysis] [data-applies] { margin: 0 0 6px; font-size: 12.5px; color: var(--an-mu2); }
[data-analysis] [data-situation] { font-size: 16px; line-height: 1.5; color: var(--an-tx); }
[data-analysis] [data-context] { font-size: 13px; line-height: 1.5; color: var(--an-mu); }
.an-tabs { display: inline-flex; gap: 4px; padding: 4px; margin-bottom: 12px; border-radius: 14px; background: rgba(0,0,0,.3); }
.an-tab { display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px; border-radius: 10px; font-size: 14px; font-weight: 650; color: var(--an-mu); }
.an-tab > i { font-style: normal; font-size: 20px; line-height: 1; }
.an-tab:hover { color: var(--an-tx); }
.an-tab.an-on { background: var(--an-s3); color: var(--an-tx); }
/* the question: FIXED height (question + one "Davon hängt ab" line) */
.an-qb { height: 92px; display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
[data-analysis] [data-question] { margin: 0; font-size: 21px; font-weight: 700; letter-spacing: -.015em; line-height: 1.25; color: var(--an-tx); }
[data-analysis] [data-stakes] { margin-top: 4px; font-size: 13.5px; line-height: 1.4; color: var(--an-mu); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
[data-analysis] [data-stakes] .an-k-l { color: var(--an-tx2); font-weight: 650; }
/* the answer block: a raised surface, capped so it never pushes the question out of view */
.an-m-a { margin: 16px 0 0 42px; transition: opacity .18s ease; }
.an-ans { max-height: 45vh; overflow-y: auto; padding: 8px; border-radius: 4px 18px 18px 18px; background: linear-gradient(180deg, #1c2230, #181c24); border: 1px solid rgba(121,192,255,.40); box-shadow: 0 14px 40px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.06); }
html[data-theme="light"] .an-ans { background: linear-gradient(180deg, #f3f8ff, #e9f1fb); box-shadow: 0 10px 28px rgba(31,35,40,.14); }
.an-kind { padding: 4px 10px 8px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--an-b3); }
html[data-theme="light"] .an-kind { color: var(--an-ac); }
.an-zone { display: flex; flex-direction: column; gap: 6px; }
[data-analysis] [data-options] { display: block; }
[data-analysis] [data-opt] { position: relative; display: grid; grid-template-columns: 22px minmax(0, 1.1fr) minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 14px; align-items: center; padding: 12px 14px; border-radius: 12px; cursor: pointer; transition: background .15s; }
[data-analysis] [data-opt] + [data-opt] { margin-top: 4px; }
[data-analysis] [data-opt]::before { content: ""; grid-column: 1; grid-row: 1 / span 2; width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--an-mu2); }
[data-analysis] [data-opt].an-cb::before { border-radius: 5px; }
[data-analysis] [data-opt]:hover { background: rgba(255,255,255,.04); }
[data-analysis] [data-opt].is-on { background: linear-gradient(90deg, rgba(88,166,255,.20), rgba(88,166,255,.06)); box-shadow: inset 0 0 0 1px rgba(121,192,255,.55); }
[data-analysis] [data-opt].is-on::before { border-color: var(--an-b2); background: radial-gradient(circle, var(--an-b2) 0 4px, transparent 5px); }
[data-analysis] [data-opt].an-cb.is-on::before { background: var(--an-b2); box-shadow: inset 0 0 0 3px #1c2230; }
[data-analysis] [data-opt]:focus-within { outline: 2px solid var(--an-ac); outline-offset: 1px; }
[data-analysis] [data-opt] > input[type=radio], [data-analysis] [data-opt] > input[type=checkbox] { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
[data-analysis] [data-opt-label] { grid-column: 2; grid-row: 1; font-weight: 650; color: var(--an-tx); }
[data-analysis] [data-opt-consequence] { grid-column: 2; grid-row: 2; font-size: 12.5px; color: var(--an-tx2); }
[data-analysis] [data-opt-preview] { grid-column: 3; grid-row: 1 / span 2; font-size: 12.5px; color: var(--an-mu); }
[data-analysis] [data-opt-preview] .an-k-l { color: var(--an-tx2); font-weight: 600; }
.an-badge { display: inline-block; margin-left: 8px; padding: 0 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700; line-height: 18px; vertical-align: 2px; background: linear-gradient(120deg, var(--an-b2), var(--an-b3)); color: #0d1117; white-space: nowrap; }
[data-analysis] [data-opt][data-opt="alt"] { min-height: 0; }
/* yes / no / other as three fields */
[data-analysis] [data-decision-mode="yesnoalt"] [data-options] { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 4px; }
[data-analysis] [data-decision-mode="yesnoalt"] [data-opt] { display: block; margin: 0; padding: 16px; text-align: center; background: var(--an-s1); }
[data-analysis] [data-decision-mode="yesnoalt"] [data-opt]::before { display: none; }
[data-analysis] [data-decision-mode="yesnoalt"] [data-opt-label] { display: block; font-size: 17px; }
[data-analysis] [data-decision-mode="yesnoalt"] [data-opt].is-on { background: linear-gradient(180deg, rgba(88,166,255,.22), rgba(88,166,255,.06)); }
.an-inl { display: none; align-items: center; gap: 8px; height: 40px; margin: 4px 4px 0; padding: 0 12px; border-radius: 10px; border: 1px dashed rgba(121,192,255,.35); }
.an-inl.an-show { display: flex; }
.an-inl > span { font-size: 12.5px; color: var(--an-mu); white-space: nowrap; }
/* "Keine passt?": a quiet text link under the rows; on, the rows step back */
.an-none { align-self: flex-start; margin: 8px 14px 6px; padding: 2px 4px; border-radius: 6px; font-size: 12.5px; color: var(--an-tx2); text-decoration: underline; text-decoration-color: var(--an-mu2); text-underline-offset: 3px; }
.an-none:hover, .an-none:focus-visible { color: var(--an-tx); }
.an-none[aria-pressed="true"] { color: var(--an-li); text-decoration: none; }
.an-is-none [data-options] { opacity: .55; }
/* foot of a question: the issue link left, Zurück / Weiter right */
.an-foot { padding-top: 14px; display: flex; align-items: center; gap: 10px 12px; flex-wrap: wrap; }
.an-quiet { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex: 1 1 220px; min-width: 0; }
.an-link { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 8px; border-radius: 7px; font-size: 12.5px; color: var(--an-mu2); white-space: nowrap; }
.an-link:hover { color: var(--an-tx2); background: var(--an-s1); }
.an-link[aria-pressed="true"] { color: var(--an-li); }
.an-go { margin-left: auto; display: flex; align-items: center; gap: 8px; }

/* ---------- first visit: the messages enter one after another (0.9 s, 1.8 s apart) with a "read me" glow ---------- */
.an-first .an-msg, .an-first .an-m-a { animation: an-in .9s cubic-bezier(.22,.8,.24,1) both; }
.an-first .an-m-q { animation-delay: 1.8s; }
.an-first .an-m-a { animation-delay: 3.6s; }
.an-first .an-msg > .an-bub, .an-first .an-m-a > .an-ans { animation: an-read 2.4s ease-out both; }
.an-first .an-m-q > .an-bub { animation-delay: 1.8s; }
.an-first .an-m-a > .an-ans { animation-delay: 3.6s; }
.an-pulse { animation: an-pulse 1.1s ease-in-out 1; }
.an-bub .an-bar-t > i { background: linear-gradient(90deg, color-mix(in srgb, var(--c) 70%, transparent), var(--c)); }
.an-bub .an-bars.an-hl > div:not(.an-on) .an-bar-t > i { background: color-mix(in srgb, var(--c) 30%, transparent); }

/* ---------- peeks: previous stage above (settled, calm), next below ---------- */
.an-peek { font-size: 12.5px; color: var(--an-mu2); padding: 4px 0; cursor: pointer; }
.an-peek[hidden] { display: none; }
.an-peek-up { display: grid; gap: 6px; justify-items: start; -webkit-mask-image: linear-gradient(0deg, #000 30%, transparent); mask-image: linear-gradient(0deg, #000 30%, transparent); }
.an-peek-dn { margin-top: 18px; text-align: center; -webkit-mask-image: linear-gradient(180deg, #000 30%, transparent); mask-image: linear-gradient(180deg, #000 30%, transparent); }
.an-peek b { color: var(--an-mu); font-weight: 600; }
.an-peek-t { width: 100%; text-align: center; }
.an-settled { max-width: 70%; padding: 6px 13px; border: 1px solid var(--an-bd2); border-radius: 4px 14px 14px 14px; font-size: 13px; color: var(--an-mu); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.an-settled-a { justify-self: end; border-radius: 14px 4px 14px 14px; border-color: rgba(121,192,255,.3); }

/* ---------- right rail: dots on a hairline, fixed 18 px rows, between the ☰ and the 💬 FAB ---------- */
.an-rail { position: fixed; right: 22px; top: 96px; bottom: 96px; width: 28px; z-index: 5; overflow-y: auto; scrollbar-width: none; background: linear-gradient(180deg, rgba(121,192,255,.35), rgba(255,255,255,.18) 50%, rgba(121,192,255,.35)) no-repeat right 4px top / 1px 100%; background-attachment: local; -webkit-mask-image: linear-gradient(180deg, transparent, #000 24px, #000 calc(100% - 24px), transparent); mask-image: linear-gradient(180deg, transparent, #000 24px, #000 calc(100% - 24px), transparent); }
.an-rail::-webkit-scrollbar { display: none; }
.an-rail:hover, .an-rail:focus-within { width: 260px; }
.an-ri { display: flex; align-items: center; justify-content: flex-end; gap: 10px; width: 100%; height: 18px; flex: none; font-size: 11px; line-height: 18px; color: transparent; white-space: nowrap; cursor: pointer; }
.an-ri > i { width: 4px; height: 4px; margin-right: 2.5px; border-radius: 50%; flex: none; background: var(--dc); box-shadow: 0 0 6px var(--dc); }
.an-ri-topic > i { width: 8px; height: 8px; margin-right: .5px; }
.an-ri-edge > i { width: 7px; height: 7px; margin-right: 1px; }
.an-ri.an-done > i { opacity: .55; }
.an-ri.an-here > i { width: 9px; height: 9px; margin-right: 0; opacity: 1; box-shadow: 0 0 10px var(--dc), 0 0 2px var(--dc); }
.an-ri > b { margin-right: 5px; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.an-rail:hover .an-ri-topic, .an-rail:hover .an-ri-edge { color: var(--an-mu); }
.an-rail:hover .an-ri.an-here { color: var(--an-tx); font-weight: 650; }
.an-ri:hover { font-size: 14px; color: var(--an-tx); font-weight: 700; }
.an-ri:has(+ .an-ri:hover), .an-ri:hover + .an-ri { font-size: 12.5px; color: var(--an-tx2); }
.an-ri:has(+ .an-ri + .an-ri:hover), .an-ri:hover + .an-ri + .an-ri { font-size: 11.5px; color: var(--an-mu); }

/* ---------- persistent composer: THE note field (sticky, clear of the concept chrome) ---------- */
.an-comp { position: sticky; bottom: 28px; z-index: 6; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; margin-top: 28px; padding: 8px 8px 8px 16px; border-radius: 18px; background: var(--an-s2); border: 1px solid var(--an-bd2); box-shadow: 0 -14px 34px color-mix(in srgb, var(--an-bg) 95%, transparent); }
.an-comp.an-glow { animation: an-comp-glow 1.8s ease-out 1; }
.an-comp-ed { min-height: 22px; max-height: 66px; overflow-y: auto; font-size: 14px; line-height: 22px; color: var(--an-tx); white-space: pre-wrap; overflow-wrap: anywhere; outline: none; caret-color: var(--an-tx); }
.an-comp-ed[data-empty="1"]::before { content: attr(data-ph); color: var(--an-mu2); pointer-events: none; }
.an-comp-ed[contenteditable="false"] { cursor: default; }
.an-tagw { display: inline-block; height: 18px; padding: 0 4px 0 7px; margin-right: 6px; border-radius: 5px; font-size: 12.5px; font-weight: 600; line-height: 18px; vertical-align: 1px; white-space: nowrap; user-select: none; background: rgba(121,192,255,.14); color: var(--an-b3); }
html[data-theme="light"] .an-tagw { color: var(--an-ac); }
.an-tagw > em { font-style: normal; margin-left: 5px; padding: 0 3px; border-radius: 3px; color: var(--an-mu); cursor: pointer; }
.an-tagw > em:hover { background: rgba(255,255,255,.1); color: var(--an-tx); }
.an-comp-b { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: var(--an-s3); color: var(--an-tx2); font-size: 16px; }
.an-comp-b:disabled { opacity: .4; cursor: default; }
.an-comp-b[hidden] { display: none; }
.an-send { background: var(--an-b1); color: #0d1117; }
.an-send svg { width: 22px; height: 22px; fill: currentColor; }
.an-send:hover:not(:disabled) { filter: brightness(1.1); }
.an-sent .an-send { animation: an-fade .4s ease-out 1; }

/* ---------- briefing + closing: the cool blue of devops concepts, no type colour of their own ---------- */
.an-brief, .an-close { position: relative; display: flex; flex-direction: column; align-items: center; min-width: 0; padding-top: 24px; text-align: center; }
.an-brief::before, .an-close::before { content: ""; position: absolute; inset: -60px -220px auto; height: 460px; background: radial-gradient(ellipse at 50% 30%, rgba(88,166,255,.22), rgba(165,214,255,.08) 45%, transparent 72%); pointer-events: none; z-index: 0; }
.an-brief > *, .an-close > * { position: relative; z-index: 1; }
.an-brief > .iteration-intro, .an-brief > .an-conn { display: none; }
.an-eyebrow { order: 1; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--an-tx2); }
[data-analysis] [data-briefing-potential], .an-big { order: 2; margin: 14px 0 4px; font-size: 22px; font-weight: 600; letter-spacing: 0; color: var(--an-tx2); }
[data-analysis] [data-briefing-potential] .an-kpi { display: inline-flex; align-items: baseline; justify-content: center; gap: 8px; }
[data-analysis] [data-briefing-potential] .an-kpi-v, .an-big { font-size: 88px; font-weight: 800; letter-spacing: -.045em; line-height: 1; background: linear-gradient(120deg, #d6ebff, var(--an-b2) 45%, var(--an-b4)); -webkit-background-clip: text; background-clip: text; color: transparent; }
[data-analysis] [data-briefing-potential] .an-kpi-u { font-size: 22px; font-weight: 600; color: var(--an-tx2); }
[data-analysis] [data-briefing-potential] .an-kpi-l { display: none; }
.an-big > small { font-size: 22px; letter-spacing: 0; font-weight: 600; -webkit-text-fill-color: var(--an-mu); }
[data-analysis] [data-briefing-what], .an-claim { order: 3; max-width: 600px; margin: 8px auto 0; font-size: 17px; font-weight: 400; letter-spacing: 0; line-height: 1.5; color: var(--an-tx2); }
[data-analysis] [data-briefing-why] { order: 4; max-width: 560px; margin: 8px auto 0; font-size: 14px; color: var(--an-mu); }
.an-chips { order: 5; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; width: 100%; margin-top: 28px; text-align: left; }
[data-analysis] [data-briefing-topic] { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 14px; background: var(--an-s1); border-top: 3px solid var(--bc, var(--an-b2)); font-size: 18px; font-weight: 700; color: var(--an-tx); cursor: pointer; text-decoration: none; transition: background .15s; }
[data-analysis] [data-briefing-topic]:hover { background: var(--an-s2); }
[data-analysis] [data-briefing-topic] em { font-style: normal; font-size: 13px; font-weight: 500; color: var(--an-tx2); }
.an-foot-brief { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; justify-items: center; padding-top: 28px; }
.an-enh:not([data-an-stage="brief"]) > .an-foot-brief { display: none; }
.an-foot-brief .an-go { margin: 0; }
.an-cta-s { font-size: 13px; color: var(--an-tx2); }
.an-cta-s:first-child { justify-self: end; }
.an-cta-s:last-child { justify-self: start; }
.an-first.an-brief > * { animation: an-in 1s cubic-bezier(.22,.8,.24,1) both; }
.an-first.an-brief > [data-briefing-potential] { animation-delay: .7s; }
.an-first.an-brief > [data-briefing-what] { animation-delay: 1.6s; }
.an-first.an-brief > [data-briefing-why] { animation-delay: 2.2s; }
.an-first.an-brief > .an-chips { animation-delay: 2.9s; }
.an-first.an-brief > .an-eyebrow { animation-delay: 0s; }
.an-close .an-big { margin-top: 14px; }
.an-sig { width: 100%; margin-top: 24px; padding: 6px 16px; border-radius: 16px; background: var(--an-s1); text-align: left; }
.an-sigrow { display: grid; grid-template-columns: 8px minmax(0, 1.3fr) minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--an-bd); font-size: 14px; }
.an-sigrow:last-child { border-bottom: 0; }
.an-sigrow > i { width: 8px; height: 26px; border-radius: 4px; background: var(--tc); }
.an-sig-n b, .an-sig-n small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.an-sig-n small { font-size: 12.5px; color: var(--an-mu); }
.an-dw { height: 8px; border-radius: 4px; background: rgba(255,255,255,.08); overflow: hidden; }
.an-dw > b { display: block; height: 100%; background: rgba(255,255,255,.30); }
.an-dw.an-warn > b { background: linear-gradient(90deg, var(--an-b4), var(--an-b2)); }
.an-tg { padding: 3px 11px; border-radius: 8px; font-size: 12.5px; font-weight: 700; background: var(--an-s2); color: var(--an-mu); box-shadow: inset 0 0 0 1px var(--an-bd2); }
.an-tg[aria-pressed="true"] { background: rgba(121,192,255,.16); color: var(--an-b3); box-shadow: inset 0 0 0 1px rgba(121,192,255,.35); }
.an-close .an-fabs { margin-top: 24px; justify-content: center; flex-wrap: wrap; }
.an-close > .an-link { margin-top: 12px; }

/* ---------- topic page: the topic's colour, never blue ---------- */
.an-intro { margin-top: 10px; }
.an-topic { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 24px; align-items: center; padding: 30px 30px 26px; border-radius: 22px; background: radial-gradient(ellipse at 15% 0%, color-mix(in srgb, var(--c) 26%, transparent), transparent 60%), var(--an-s1); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent); cursor: default; }
.an-first .an-topic { animation: an-in .9s cubic-bezier(.22,.8,.24,1) both; }
.an-topic .an-h { margin: 6px 0 12px; font-size: 30px; line-height: 1.2; letter-spacing: -.025em; }
.an-ring { width: 150px; height: 150px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--c) 0 var(--p, 0%), rgba(255,255,255,.08) 0 100%); }
.an-ring > div { width: 112px; height: 112px; border-radius: 50%; display: grid; place-items: center; align-content: center; text-align: center; background: var(--an-bg); }
.an-ring b { display: block; font-size: 26px; }
.an-ring small { font-size: 11px; color: var(--an-mu); }
.an-tq { display: grid; gap: 4px; }
.an-tqi { display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 10px; padding: 4px 0; color: var(--an-tx2); }
.an-tqi:hover { color: var(--an-tx); }
.an-tqi > b { color: var(--c); }
.an-topic .an-go { margin: 18px 0 0; }
.an-topic .an-btn { background: var(--c); color: #121212; box-shadow: none; }
[data-analysis] .an-epic { flex: 0 1 160px; height: 30px; padding: 0 9px; border: 1px solid var(--an-bd2); border-radius: 8px; background: var(--an-s1); font-size: 12.5px; }
[data-analysis] .an-epic[hidden] { display: none; }
.an-lhead { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--an-bd); }
.an-lhead .an-lt { font-size: 13px; font-weight: 700; color: var(--an-tx2); }
.an-lhead .an-lpr { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--an-mu); }
[data-analysis] input[type=text] { flex: 1; min-width: 0; height: 30px; border: 0; background: none; color: var(--an-tx); font: inherit; outline: none; }
/* slider over a bar */
.an-sl { position: relative; padding: 24px 26px 14px; border-radius: 16px; background: var(--an-s1); border: 1.5px solid var(--an-bd2); }
.an-sl-top { display: flex; justify-content: space-between; align-items: baseline; font-size: 12.5px; color: var(--an-mu); }
.an-sl-v { font-size: 28px; font-weight: 780; letter-spacing: -.02em; color: var(--an-tx); }
.an-sl-v small { font-size: 13px; color: var(--an-mu); font-weight: 500; margin-left: 6px; }
.an-sl input[type=range] { -webkit-appearance: none; appearance: none; display: block; width: 100%; height: 12px; margin: 18px 0 8px; border-radius: 6px; cursor: pointer; background: linear-gradient(90deg, var(--an-li) 0 var(--an-p, 50%), var(--an-s3) var(--an-p, 50%) 100%); }
.an-sl input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 32px; height: 32px; border-radius: 50%; background: #fff; border: 7px solid var(--an-ac); box-shadow: 0 4px 14px rgba(0,0,0,.45); }
.an-sl input[type=range]::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 7px solid var(--an-ac); }
.an-sl-rec { position: relative; height: 34px; }
.an-sl-rec .an-badge { position: absolute; top: 4px; right: auto; transform: translateX(-50%); }
/* order */
.an-ord { display: flex; flex-direction: column; gap: 8px; counter-reset: ord; }
.an-oi { display: grid; grid-template-columns: 22px 28px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px 14px; border-radius: 14px; background: var(--an-s1); border: 1.5px solid var(--an-bd2); cursor: grab; }
.an-oi:focus-visible { outline: 2px solid var(--an-ac); }
.an-oi.an-drag { opacity: .45; }
.an-oi::before { content: "⠿"; color: var(--an-mu2); font-size: 17px; }
.an-oi > b { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: var(--an-s3); font-size: 12.5px; }
.an-oi .an-ol { font-size: 15px; font-weight: 650; }
.an-oi .an-ol small { display: block; font-size: 12.5px; font-weight: 400; color: var(--an-mu); }
.an-oi .an-ob { display: inline-flex; gap: 4px; }
.an-oi .an-ob button { width: 32px; height: 32px; border-radius: 9px; box-shadow: inset 0 0 0 1px var(--an-bd2); text-align: center; color: var(--an-mu); }
.an-oi .an-ob button:hover { color: var(--an-tx); background: var(--an-s3); }
.an-link { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 8px; border-radius: 7px; font-size: 12.5px; color: var(--an-mu2); white-space: nowrap; }
.an-link:hover { color: var(--an-tx2); background: var(--an-s1); }
.an-link[aria-pressed="true"] { color: var(--an-li); }
.an-go { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.an-btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; height: 48px; padding: 0 26px; border-radius: 13px; background: linear-gradient(180deg, #3d8ffd, #1f6feb); color: #fff; font-weight: 680; font-size: 15.5px; box-shadow: 0 8px 22px rgba(31,111,235,.3), inset 0 1px 0 rgba(255,255,255,.22); white-space: nowrap; }
.an-btn:hover { filter: brightness(1.08); }
.an-btn2 { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; padding: 0 18px; border-radius: 12px; background: var(--an-s2); color: var(--an-tx2); font-size: 14px; font-weight: 550; box-shadow: inset 0 0 0 1px var(--an-bd2); white-space: nowrap; }
.an-btn2:hover { color: var(--an-tx); background: var(--an-s3); }
/* Fertig: the ☰ menu's actions as FAB-style pills, bottom right (icon disc + label). */
.an-fabs { display: flex; align-items: center; gap: 10px; }
.an-fab { display: inline-flex; align-items: center; gap: 10px; height: 48px; padding: 0 20px 0 8px; border-radius: 999px; background: var(--an-s2); color: var(--an-tx); font-size: 14px; font-weight: 620; white-space: nowrap; box-shadow: inset 0 0 0 1px var(--an-bd2), 0 8px 22px rgba(0,0,0,.35); transition: transform .12s, filter .12s; }
.an-fab:hover { transform: translateY(-1px); filter: brightness(1.12); }
.an-fab-i { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,.12); font-size: 15px; line-height: 1; flex: none; }
.an-fab-main { background: linear-gradient(180deg, #3d8ffd, #1f6feb); color: #fff; box-shadow: 0 8px 22px rgba(31,111,235,.3), inset 0 1px 0 rgba(255,255,255,.22); }
.an-fab-warn { color: var(--an-warn); box-shadow: inset 0 0 0 1.5px var(--an-warn), 0 8px 22px rgba(0,0,0,.35); }
.an-fab-warn .an-fab-i { background: rgba(210,153,34,.18); }
.an-fab-warn[data-armed="true"] { background: var(--an-warn); color: #1a1200; }
@media (prefers-reduced-motion: reduce) { .an-fab { transition: none; } .an-fab:hover { transform: none; } }
/* "All as list": one discreet icon at the end of the header row. */
.an-listbtn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; color: var(--an-mu2); flex: none; }
.an-listbtn:hover, .an-listbtn:focus-visible { color: var(--an-tx); background: var(--an-s2); }
.an-step > .an-listbtn { margin-left: auto; }
.an-back { height: 44px; padding: 0 12px; display: inline-flex; align-items: center; font-size: 13.5px; color: var(--an-mu); border-radius: 10px; }
.an-back:hover { color: var(--an-tx); background: var(--an-s1); }
.an-back[disabled] { visibility: hidden; pointer-events: none; }
/* Constant widths: "Weiter" / "Starten" / "Los geht's" and an absent next
   button (.an-go-ph) take the same room, so Zurück never moves either. */
.an-go .an-btn, .an-go-ph { min-width: 10.5rem; }
.an-go-ph { visibility: hidden; height: 48px; }
.an-go .an-btn.an-glow { animation: an-glow 2.4s ease-in-out 1.2s infinite; }
.an-go .an-btn.an-pressed { animation: none; }

.an-h { font-size: 28px; font-weight: 740; letter-spacing: -.02em; line-height: 1.2; }
.an-sub { font-size: 13.5px; color: var(--an-mu); margin-top: 6px; }
.an-st { width: 10px; height: 10px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--an-mu2); }
.an-st.an-s-ok { background: var(--an-ok); box-shadow: none; }
.an-st.an-s-dev { background: var(--an-warn); box-shadow: none; }
.an-st.an-s-iss { box-shadow: inset 0 0 0 2.5px var(--an-li); }
.an-st.an-s-un { box-shadow: none; outline: 1.5px dashed var(--an-mu); outline-offset: -1.5px; }
.an-mini { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; margin-top: 18px; }
.an-mini > div { padding: 10px 12px; border-radius: 12px; background: var(--an-s1); border: 1px solid var(--an-bd); font-size: 12px; color: var(--an-mu); }
.an-mini b { display: block; color: var(--an-tx); font-size: 13px; margin-bottom: 3px; }
.an-mini .an-dv { border-color: rgba(210,153,34,.45); }
/* ---------- palette (CONCEPT_VIZ) ---------- */
[data-viz] { min-width: 0; }
.an-vz-text > * + * { margin-top: 6px; }
.an-vz-text ul { padding-left: 16px; list-style: disc; }
.an-kpi { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
.an-kpi-v { font-size: 26px; font-weight: 780; letter-spacing: -.02em; color: var(--an-li); }
.an-kpi-u { font-size: 13px; font-weight: 600; color: var(--an-tx2); }
.an-kpi-d { font-size: 12px; font-weight: 650; color: var(--an-li); padding: 1px 7px; border-radius: 999px; background: var(--an-li-soft); }
.an-kpi-l { flex-basis: 100%; font-size: 12px; color: var(--an-mu); }
.an-vz-short .an-kpi-v { font-size: 20px; }
.an-bar-h { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--an-mu); margin-bottom: 4px; }
.an-bar-h b { color: var(--an-tx); }
.an-bar-t { height: 10px; border-radius: 5px; background: var(--an-s3); overflow: hidden; }
.an-bar-t > i { display: block; height: 100%; border-radius: 5px; background: linear-gradient(90deg, #58a6ff, var(--an-li)); }
.an-bars { display: flex; flex-direction: column; gap: 6px; }
.an-bars > div { display: grid; grid-template-columns: minmax(60px, 34%) minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: 12px; color: var(--an-tx2); }
.an-bars b { font-weight: 700; color: var(--an-tx); font-size: 12px; }
/* spec.hl: the item(s) the question is about stay accented, the rest steps back. */
.an-bars.an-hl > div:not(.an-on) { opacity: .45; }
.an-bars.an-hl > .an-on span { color: var(--an-tx); font-weight: 650; }
.an-vz-short .an-bars { gap: 3px; }
.an-spark svg, .an-donut svg { display: block; }
.an-spark svg { width: 100%; height: 56px; }
.an-vz-short .an-spark svg { height: 24px; }
.an-spark small, .an-donut small { font-size: 11.5px; color: var(--an-mu); }
.an-spark-l { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--an-mu); }
.an-donut { display: flex; align-items: center; gap: 12px; }
.an-donut svg { width: 72px; height: 72px; flex: none; }
.an-vz-short .an-donut svg { width: 40px; height: 40px; }
.an-donut ul { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--an-tx2); }
.an-donut li { display: flex; align-items: center; gap: 6px; }
.an-donut li i { width: 9px; height: 9px; border-radius: 3px; flex: none; }
.an-cmp { display: flex; flex-direction: column; gap: 6px; }
.an-cmp-r { display: grid; grid-template-columns: minmax(50px, 26%) minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: 12px; color: var(--an-tx2); }
.an-cmp-r.an-after .an-bar-t > i { background: var(--an-li); }
.an-cmp-r:not(.an-after) .an-bar-t > i { background: var(--an-mu2); }
.an-cmp-d { font-size: 12px; font-weight: 700; color: var(--an-li); }
.an-flow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.an-flow > span { padding: 5px 9px; border-radius: 9px; background: var(--an-s3); font-size: 12px; color: var(--an-tx2); }
.an-flow > span b { display: block; color: var(--an-tx); font-size: 12.5px; }
.an-flow > i { font-style: normal; color: var(--an-mu2); }

@keyframes an-rise { from { opacity: 0; transform: translateY(46px); } to { opacity: 1; transform: none; } }
@keyframes an-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes an-draw { from { stroke-dashoffset: var(--len, 400); } to { stroke-dashoffset: 0; } }
@keyframes an-glow { 0%, 100% { box-shadow: 0 10px 30px rgba(31,111,235,.4), 0 0 0 0 rgba(47,129,247,.45); } 50% { box-shadow: 0 10px 30px rgba(31,111,235,.4), 0 0 0 12px rgba(47,129,247,0); } }
@media (prefers-reduced-motion: reduce) {
  [data-analysis] *, [data-analysis] *::before, [data-analysis] *::after { animation: none !important; transition: none !important; }
}

@keyframes an-in { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@keyframes an-read { 0%, 15% { box-shadow: 0 0 0 0 rgba(121,192,255,0); } 35%, 70% { box-shadow: 0 0 0 2px rgba(121,192,255,.45), 0 0 34px rgba(121,192,255,.18); } 100% { box-shadow: 0 0 0 0 rgba(121,192,255,0); } }
@keyframes an-pulse { 50% { filter: brightness(1.5); box-shadow: 0 0 12px var(--c); } }
@keyframes an-comp-glow { 0% { box-shadow: 0 0 0 0 rgba(121,192,255,0); } 30% { box-shadow: 0 0 0 2px rgba(121,192,255,.55), 0 0 28px rgba(121,192,255,.3); } 100% { box-shadow: 0 0 0 0 rgba(121,192,255,0); } }
@media (max-width: 900px) {
  .an-rail { display: none; }
  .an-enh { padding: 24px 14px 28px; }
  .an-comp { bottom: 88px; }
  .an-topic { grid-template-columns: minmax(0, 1fr); }
  .an-ring { justify-self: center; }
  [data-analysis] [data-question] { font-size: 19px; }
  [data-analysis] [data-briefing-potential] .an-kpi-v, .an-big { font-size: 56px; }
  [data-analysis] [data-opt] { grid-template-columns: 22px minmax(0, 1fr); }
  [data-analysis] [data-opt-preview] { grid-column: 2; grid-row: 3; }
  .an-sigrow { grid-template-columns: 8px minmax(0, 1fr) auto; }
  .an-dw { display: none; }
}

/* section-nav state for mode decisions (updateSectionNavState) */
.section-nav-state.state-open { color: var(--text-secondary, #8b949e); }
.section-nav-state.state-decided { color: var(--accent-color, #58a6ff); }
.section-nav-state.state-issue { color: var(--accent-color, #58a6ff); font-weight: 600; }
```
