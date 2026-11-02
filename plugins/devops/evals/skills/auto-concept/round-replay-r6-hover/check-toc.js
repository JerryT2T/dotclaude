// Browser check of the replay case: node check-toc.js <built-concept.html>
// Opens the built page in headless SYSTEM Edge (playwright-core, no browser
// download), takes the live round, finds every right-side table of contents
// (a "rail": an element whose class mentions rail/toc/outline/dots/minimap
// with >= 5 direct children, outside the engine chrome) on every screen of the
// round, and measures with a REAL mouse:
//   overlap  - the rect of any rail item (its box including the revealed label,
//              also of the scaled neighbours) or of the rail itself intersects
//              a visible engine FAB (.panel-fab = ☰, .feedback-fab = 💬,
//              .anno-toggle-fab), at rest and during hover. Viewports 1440x900
//              and 1280x720.
//   gaps     - dead gap along the rail's own content box (see the sweep below).
//   maxItems - the largest rail seen (the 7x7 maximum example = 58 items).
//              item, a point that is not on an item (a dead gap).
//   cursor   - computed cursor under the mouse on each item is not "pointer".
// Prints one JSON line. Exit 3 + {"unavailable":"..."} when playwright-core or
// Edge cannot be loaded (the grader then reports n/a).
"use strict";
/* global window, document, getComputedStyle */ // the in-page callbacks run in the browser

const html = process.argv[2];
const out = (o, code = 0) => { process.stdout.write(JSON.stringify(o) + "\n"); process.exit(code); };
if (!html) out({ unavailable: "no html path" }, 3);

let chromium;
try { ({ chromium } = require("playwright-core")); } catch (e) { out({ unavailable: "playwright-core: " + e.message }, 3); }

const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1366, height: 600 }];
const GAP_TOL = 2; // px of tolerated dead run at item borders
const RAIL_SEL = '[class*="rail"],[class*="toc"],[class*="outline"],[class*="dots"],[class*="minimap"]';
const FAB_SEL = ".panel-fab,.feedback-fab,.anno-toggle-fab";

// In-page helpers, installed once per page.
const INIT = () => {
  const live = () => document.querySelector("section[data-iteration][data-active]") ||
    [...document.querySelectorAll("section[data-iteration]")].filter((s) => !s.hidden).pop();
  const isChrome = (el) => !!el.closest(".panel-fab,.feedback-fab,.anno-toggle-fab,#panel,[class*='panel-'],[class*='feedback-'],.anno");
  const rails = (root) => [...root.querySelectorAll(RAIL_SEL)]
    .filter((el) => el.children.length >= 5 && !isChrome(el) && !el.parentElement.closest(RAIL_SEL));
  const box = (el) => { // element box united with its (possibly overflowing) content
    const r = el.getBoundingClientRect();
    let l = r.left, t = r.top, rt = r.right, b = r.bottom;
    const rg = document.createRange(); rg.selectNodeContents(el);
    for (const c of rg.getClientRects()) { l = Math.min(l, c.left); t = Math.min(t, c.top); rt = Math.max(rt, c.right); b = Math.max(b, c.bottom); }
    return { l, t, r: rt, b };
  };
  const fabs = () => [...document.querySelectorAll(FAB_SEL)].map((el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return { n: el.className.split(" ")[0], l: r.left, t: r.top, r: r.right, b: r.bottom, vis: r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden" };
  }).filter((f) => f.vis);
  const hit = (a, f) => a.l < f.r && a.r > f.l && a.t < f.b && a.b > f.t;
  window.__chk = { live, rails, box, fabs, hit };
};

(async () => {
  let browser;
  try { browser = await chromium.launch({ channel: "msedge", headless: true }); } catch (e) { out({ unavailable: "edge: " + e.message.split("\n")[0] }, 3); }
  const res = { overlap: [], gaps: [], cursor: [], rails: 0, items: 0, maxItems: 0 };
  const ov = new Map(); // "screen rail state fab" -> item names (keeps the output short)
  const addOv = (hits) => { for (const [label, nm, fab] of hits) { const k = `${label} <-> ${fab}`; (ov.get(k) || ov.set(k, new Set()).get(k)).add(nm); } };
  try {
    for (const [vi, vp] of VIEWPORTS.entries()) {
      const quick = vi > 0; // 2nd viewport: rest + a sample of hovers, no sweep
      const page = await browser.newPage({ viewport: vp });
      await page.goto("file:///" + html.replace(/\\/g, "/").replace(/^\//, ""));
      await page.evaluate(`(${INIT.toString().replace(/RAIL_SEL/g, JSON.stringify(RAIL_SEL)).replace(/FAB_SEL/g, JSON.stringify(FAB_SEL))})()`);
      // Show the live round, then each of its screens in turn.
      const screens = await page.evaluate(() => {
        const live = window.__chk.live();
        document.querySelectorAll("section[data-iteration]").forEach((s) => { s.hidden = s !== live; });
        const ss = [...live.querySelectorAll("[data-screen]")];
        return ss.map((s, i) => { s.setAttribute("data-chk", i); return { i, id: s.id }; });
      });
      const targets = screens.length ? screens : [{ i: -1, id: "round" }];
      for (const sc of targets) {
        await page.evaluate((i) => {
          const live = window.__chk.live();
          live.querySelectorAll("[data-screen]").forEach((s) => { s.hidden = s.getAttribute("data-chk") !== String(i); });
          let el = live.querySelector(`[data-chk="${i}"]`);
          for (; el && el !== document.body; el = el.parentElement) el.hidden = false;
        }, sc.i);
        await page.mouse.move(2, 2);
        const n = await page.evaluate(() => { const live = window.__chk.live(); const rs = window.__chk.rails(live); rs.forEach((r, k) => r.setAttribute("data-chk-rail", k)); return rs.length; });
        for (let k = 0; k < n; k++) {
          res.rails++; if (process.env.CHK_DEBUG) process.stderr.write(`rail ${k} on ${sc.id}@${vp.width} ${Date.now()}
`);
          const sel = `[data-chk-rail="${k}"]`;
          const measure = (label) => page.evaluate(({ sel, label }) => {
            const c = window.__chk, rail = document.querySelector(sel), fabs = c.fabs();
            const parts = [["rail", c.box(rail)], ...[...rail.children].map((p, j) => ["item " + j, c.box(p)])];
            const hits = [];
            for (const [nm, b] of parts) for (const f of fabs) if (c.hit(b, f)) hits.push([label, nm, f.n]);
            return hits;
          }, { sel, label: `${sc.id}@${vp.width}x${vp.height} rail${k} ` + label });
          const first = await page.evaluate((sel) => { const r = document.querySelector(sel); r.scrollIntoView({ block: "center" }); return r.children.length; }, sel);
          addOv(await measure("rest"));
          res.items += first; res.maxItems = Math.max(res.maxItems, first);
          for (let j = 0; j < first; j++) {
            if (quick && j % 8 !== 0 && j !== first - 1) continue;
            // Aim at the item's own box (right part: the dot), not the empty label side.
            const r = await page.evaluate(({ sel, j }) => { const it = document.querySelector(sel).children[j]; it.scrollIntoView({ block: "nearest" }); const b = it.getBoundingClientRect(); return { x: b.right - 3, y: b.top + b.height / 2 }; }, { sel, j });
            await page.mouse.move(r.x, r.y, { steps: 2 });
            await page.waitForTimeout(180); // transitions (.16-.2s) settle
            const state = await page.evaluate(({ sel, x, y }) => {
              const rail = document.querySelector(sel), el = document.elementFromPoint(x, y);
              const item = el && [...rail.children].find((c) => c.contains(el));
              return { onItem: !!item, cursor: el ? getComputedStyle(el).cursor : "", tag: el ? el.tagName : "" };
            }, { sel, x: r.x, y: r.y });
            if (state.tag && state.cursor !== "pointer") res.cursor.push(`${sc.id}@${vp.width} item ${j}: cursor ${state.cursor} on <${state.tag}>`);
            addOv(await measure("hover"));
          }
          // Dead-gap sweep: the user's rule is "hovering you are always on a
          // navigation item, not in a gap (focus-wise, not visually)". The mouse
          // rests on the rail (hover state active); then elementFromPoint walks
          // the rail's own content box (padding excluded, margins never) at 1 px
          // steps, along two columns (the dot column near the right edge and the
          // middle). A point is a gap when the hit is the rail itself or nothing,
          // not an item or a child of one. A run of <= GAP_TOL px (item borders,
          // sub-pixel seams) is tolerated; the longer run counts.
          if (quick) continue;
          const box = await page.evaluate((sel) => {
            const rail = document.querySelector(sel); rail.scrollIntoView({ block: "center" });
            const r = rail.getBoundingClientRect(), cs = getComputedStyle(rail), p = (k) => parseFloat(cs[k]) || 0;
            const l = r.left + p("paddingLeft"), rt = r.right - p("paddingRight"), t = Math.max(0, r.top + p("paddingTop")), b = Math.min(window.innerHeight, r.bottom - p("paddingBottom"));
            return { xs: [rt - 6, (l + rt) / 2], t, b };
          }, sel);
          await page.mouse.move(box.xs[0], (box.t + box.b) / 2);
          await page.waitForTimeout(250);
          const sweepGap = await page.evaluate(({ sel, xs, t, b, tol }) => {
            const rail = document.querySelector(sel); let worst = 0, total = 0, n = 0;
            for (const x of xs) {
              let run = 0;
              for (let y = Math.ceil(t) + 1; y < b - 1; y++) {
                const el = document.elementFromPoint(x, y); n++;
                const ok = !!el && [...rail.children].some((c) => c.contains(el));
                if (ok) run = 0; else { run++; if (run > tol) total++; worst = Math.max(worst, run); }
              }
            }
            return { worst, total, n };
          }, { sel, xs: box.xs, t: box.t, b: box.b, tol: GAP_TOL });
          if (sweepGap.worst > GAP_TOL) res.gaps.push(`${sc.id}@${vp.width} rail${k}: dead gap up to ${sweepGap.worst}px (${sweepGap.total}/${sweepGap.n} sampled points beyond ${GAP_TOL}px)`);
          await page.mouse.move(2, 2);
        }
      }
      await page.close();
    }
  } catch (e) { await browser.close(); out({ error: e.message.split("\n")[0] }, 2); }
  await browser.close();
  for (const [k, items] of ov) res.overlap.push(`${k}: ${[...items].slice(0, 6).join(", ")}${items.size > 6 ? ` (+${items.size - 6} more)` : ""}`);
  out(res);
})();
