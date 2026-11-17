// Etappen in free order (concept 20261117-1305-etappen-einzeln): start any open
// Etappe from its pane, "Nächste Etappe ›" to the next OPEN one, the implement
// station in every Etappe, stage final reports named after their Etappe, and
// the close-out of a stage report ("Offene Etappen", final:false / true).
// Pages are assembled by concept-build.js from the real engine and run on jsdom.
import { describe, test, expect } from "vitest";
import { JSDOM, VirtualConsole } from "jsdom";
import cb from "../../scripts/concept-build.js";

const STAGES = [
  { id: "A", name: "Use Cases" },
  { id: "B", name: "Struktur" },
  { id: "C", name: "Visuelles Design" },
];

const round = (n, stage, { baked = false } = {}) => `<section data-iteration="${n}" data-iteration-template="decision"${baked ? " data-baked" : ""}${stage ? ` data-stage="${stage}"` : ""}>
  <div class="iteration-intro"><h2>Runde ${n}</h2></div>
  <section id="v${n}" class="variant-card" data-nav-label="Variante ${n}">
    <div class="variant-evaluation" data-decision="v${n}" data-label="V${n}">
      <div class="eval-group">
        <label class="eval-option"><input type="radio" name="eval-v${n}" value="discard"><span class="eval-label">{{variant.discard}}</span></label>
        <label class="eval-option"><input type="radio" name="eval-v${n}" value="include" checked><span class="eval-label">{{variant.include}}</span></label>
      </div>
    </div>
  </section>
</section>`;
const report = (n, stage, { baked = false } = {}) => `<section data-iteration="${n}" data-iteration-template="free" data-final-report${baked ? " data-baked" : ""}${stage ? ` data-stage="${stage}"` : ""}>
  <h2>Bericht</h2>
  <details class="fr-fold" data-open-questions><ul>
    <li data-oq-id="oq-1" data-issue-title="[CHORE] Hint text" data-issue-type="chore" data-route-default="issue" data-oq-origin="found"><span class="oq-label">Hint text</span></li>
  </ul></details>
</section>`;

/** rounds: fragment strings in order; stages: page.json stages (state optional). */
async function page({ rounds, stages = STAGES, locale = "de" }) {
  const pageJson = { title: "Hub-Navigation", locale, icon: "🧭" };
  if (stages) pageJson.stages = stages;
  const res = cb.assemble({ page: pageJson, head: "", fragments: rounds.map((html, i) => ({ n: i + 1, html })), slug: "t" });
  const posted = [];
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => errors.push(String((e && (e.detail?.message || e.message)) || e)));
  const dom = new JSDOM(res.html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/t.html", virtualConsole,
    beforeParse(w) {
      w.__posted = posted;
      w.fetch = async (url, opts) => {
        if (opts && opts.method === "POST") posted.push({ url: String(url), body: opts.body ? JSON.parse(opts.body) : null });
        return { ok: true, status: 200, json: async () => ({ durable: true }), text: async () => "" };
      };
      w.confirm = () => true;
      w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
    },
  });
  const { window } = dom;
  // The engine boots on DOMContentLoaded, which jsdom fires after this tick.
  for (let i = 0; i < 50 && window.document.readyState !== "complete"; i++) await tick(5);
  await tick(20);
  const $ = (s) => window.document.querySelector(s);
  const $$ = (s) => [...window.document.querySelectorAll(s)];
  const decisions = () => posted.filter((p) => /\/decisions$/.test(p.url)).map((p) => p.body);
  const tab = (id) => $(`#stage-tabs .stage-tab[data-stage-id="${id}"]`);
  return { window, $, $$, res, errors, decisions, tab, last: () => decisions().at(-1) };
}
function tick(ms = 0) { return new Promise((r) => setTimeout(r, ms)); }

describe("Etappen free order — stepper, panes, start control", () => {
  // A baked, B live (rounds 2–3), C not started.
  const rounds = () => [round(1, "A", { baked: true }), round(2, "B", { baked: true }), round(3, "B")];

  test("the page assembles and shows one tab per Etappe", async () => {
    const p = await page({ rounds: rounds() });
    expect(p.res.problems).toEqual([]);
    expect(p.errors).toEqual([]);
    expect(p.$$("#stage-tabs .stage-tab").map((t) => t.dataset.stageId)).toEqual(["A", "B", "C"]);
  });

  test("the English page boots without script errors and uses 'stage' throughout", async () => {
    const p = await page({ rounds: rounds(), locale: "en" });
    expect(p.errors).toEqual([]);
    p.tab("C").click();
    expect(p.$("#stage-start").textContent).toContain("Start this stage");
    expect(p.$("#submit-implement-btn .jr-ul-txt b").textContent).toBe("Build this stage");
  });

  test("start control only for open, non-live Etappen; its click submits next-stage", async () => {
    const p = await page({ rounds: rounds() });
    p.tab("B").click();
    expect(p.$("#stage-start"), "no start for the live Etappe").toBeNull();
    p.tab("A").click();
    const a = p.$("#stage-pane > .stage-start");
    expect(a.textContent).toContain("Mit dieser Etappe weitermachen");
    expect(a.dataset.tip).toBeTruthy();
    expect(a.hasAttribute("title")).toBe(false);
    p.tab("C").click();
    const c = p.$("#stage-pane > .stage-start");
    expect(c.textContent).toContain("Etappe starten");
    expect(p.$("#stage-pane").textContent).not.toMatch(/Beginnt nach der aktuellen Etappe/);
    c.click();
    await tick();
    expect(p.last()).toMatchObject({ action: "next-stage", stage: "B", next: "C" });
  });

  test("a built, an issue and a dropped Etappe: no start control, their state on the tab", async () => {
    const stages = [{ id: "A", name: "Use Cases" }, { id: "B", name: "Struktur", state: "issue" },
      { id: "C", name: "Visuelles Design", state: "dropped" }, { id: "D", name: "Texte" }];
    const p = await page({ stages, rounds: [round(1, "A", { baked: true }), report(2, "A", { baked: true }), round(3, "D")] });
    expect(p.res.problems).toEqual([]);
    expect(["A", "B", "C", "D"].map((id) => p.tab(id).dataset.state)).toEqual(["done", "closed", "closed", "now"]);
    expect(p.tab("A").dataset.tip).toMatch(/\nGebaut$/);
    expect(p.tab("B").dataset.tip).toMatch(/Als Issue angelegt/);
    expect(p.tab("C").dataset.tip).toMatch(/Gestrichen/);
    for (const id of ["A", "B", "C"]) {
      p.tab(id).click();
      expect(p.$("#stage-start"), id).toBeNull();
    }
    expect(p.$("#stage-pane .stage-ahead").textContent).toBe("Gestrichen");
    expect(p.res.html).toMatch(/\.stage-tab\[data-state="closed"\] \.stage-tn \{ text-decoration: line-through/);
    expect(p.$("#jr-next-stage"), "no other open Etappe").toBeNull();
  });

  test("a passed-over Etappe stays open and selectable", async () => {
    const p = await page({ rounds: [round(1, "A", { baked: true }), round(2, "C")] });
    expect(p.tab("B").dataset.state).toBe("ahead");
    expect(p.tab("A").dataset.state).toBe("open");
    p.tab("B").click();
    expect(p.$("#stage-start")).toBeTruthy();
  });

  test("no start control on a frozen round's view", async () => {
    const p = await page({ rounds: rounds() });
    p.window.showIteration("1");
    p.tab("C").click();
    expect(p.$("#stage-start")).toBeNull();
  });
});

describe("Etappen free order — journey row", () => {
  test("stations stand in a non-last Etappe, implement reads 'Diese Etappe umsetzen' and names the stage", async () => {
    const p = await page({ rounds: [round(1, "A")] });
    expect(p.$("#journey #jr-lock")).toBeTruthy();
    expect(p.$("#journey .jr-impl")).toBeTruthy();
    expect(p.$("#submit-implement-btn .jr-ul-txt b").textContent).toBe("Diese Etappe umsetzen");
    p.$("#submit-implement-btn").click();
    await tick();
    expect(p.last()).toMatchObject({ action: "implement", stage: "A" });
  });

  test("'Nächste Etappe ›' targets the next OPEN Etappe and wraps around", async () => {
    const stages = [{ id: "A", name: "Use Cases" }, { id: "B", name: "Struktur" }, { id: "C", name: "Visuelles Design", state: "dropped" }];
    const p = await page({ stages, rounds: [round(1, "A", { baked: true }), round(2, "B")] });
    expect(p.$("#jr-next-stage").dataset.next, "C is dropped → wrap to A").toBe("A");
    expect(p.$("#jr-next-stage").textContent).toBe("Nächste Etappe ›");
    p.$("#jr-next-stage").click();
    return tick().then(() => expect(p.last()).toMatchObject({ action: "next-stage", stage: "B", next: "A" }));
  });

  test("an unstaged concept keeps today's implement label and payload", async () => {
    const p = await page({ stages: null, rounds: [round(1, null)] });
    expect(p.$("#stage-tabs")).toBeNull();
    expect(p.$("#jr-next-stage")).toBeNull();
    expect(p.$("#submit-implement-btn .jr-ul-txt b").textContent).toBe("Jetzt umsetzen");
    p.$("#submit-implement-btn").click();
    await tick();
    expect(p.last().action).toBe("implement");
    expect("stage" in p.last()).toBe(false);
  });
});

describe("Etappen free order — stage final reports", () => {
  test("A(baked) → report A(baked) → round C: tab + head name the Etappe, the report is frozen and reachable", async () => {
    const p = await page({ rounds: [round(1, "A", { baked: true }), report(2, "A", { baked: true }), round(3, "C")] });
    expect(p.res.problems).toEqual([]);
    const repTab = p.$('.iteration-tab[data-iteration="2"]');
    expect(repTab.textContent.trim()).toBe("🏁 Use Cases");
    p.tab("A").click();
    const row = p.$("#stage-pane .stage-report");
    expect(row.textContent).toBe("🏁 Use Cases");
    row.click();
    expect(p.$('section[data-iteration="2"]').hidden).toBe(false);
    expect(p.window.document.body.classList.contains("viewing-frozen")).toBe(true);
    expect(p.$("#panel-final-report").style.display).toBe("none");
    expect(p.$("[data-here-round]").textContent).toBe("🏁 Use Cases · archiviert");
  });

  test("an untagged final report keeps '🏁 Abschluss'", async () => {
    const p = await page({ rounds: [round(1, "A", { baked: true }), report(2, null)] });
    expect(p.$("[data-here-round]").textContent).toBe("🏁 Abschluss");
  });
});

describe("Etappen free order — close-out of a live stage report", () => {
  const live = () => page({ rounds: [round(1, "A", { baked: true }), report(2, "A")] });

  test("B and C open: the block, one go button, no ship, no disposition; default payload final:false", async () => {
    const p = await live();
    expect(p.$("[data-here-round]").textContent).toBe("🏁 Use Cases");
    const group = p.$('[data-closeout-group="stages"]');
    expect(group.hidden).toBe(false);
    expect(group.querySelector(".closeout-gh").textContent).toMatch(/^Offene Etappen 2/);
    const rows = [...group.querySelectorAll("[data-stage-row]")];
    expect(rows.map((r) => r.dataset.stageRow)).toEqual(["B", "C"]);
    expect([...rows[0].querySelectorAll(".stage-co-opt span")].map((s) => s.textContent)).toEqual(["nachholen", "als Issue anlegen", "streichen"]);
    expect([...group.querySelectorAll('input[name="stage-next"]')].map((i) => [i.value, i.checked])).toEqual([["B", true], ["C", false]]);
    expect(p.$("#closeout-stage-go").hidden).toBe(false);
    expect(p.$("#closeout-ship").hidden).toBe(true);
    expect(p.$("#closeout-noship").hidden).toBe(true);
    expect(p.$("#closeout-sheet").hasAttribute("data-stage-continue")).toBe(true);
    expect(p.$("#closeout-stage-plan").textContent).toContain("Weiter mit Etappe B · Struktur");
    p.$("#closeout-stage-go").click();
    await tick();
    const body = p.last();
    expect(body).toMatchObject({
      action: "finalize", stage: "A", final: false, next: "B",
      stages: [{ id: "B", route: "open" }, { id: "C", route: "open" }],
      ship: { run: false }, disposition: null,
    });
    expect(p.$("#closeout-stage-go").dataset.finalizeState).toBe("running");
  });

  test("routing B to issue and C to drop flips to final:true and brings ship + disposition back", async () => {
    const p = await live();
    const pick = (name, value) => {
      const i = p.$(`input[name="${name}"][value="${value}"]`);
      i.checked = true;
      i.dispatchEvent(new p.window.Event("change", { bubbles: true }));
    };
    pick("stage-route-B", "issue");
    expect(p.$('input[name="stage-next"]:checked').value, "C is now the first kept one").toBe("C");
    pick("stage-route-C", "drop");
    expect(p.$('.stage-co-next').hidden).toBe(true);
    expect(p.$("#closeout-stage-go").hidden).toBe(true);
    expect(p.$("#closeout-ship").hidden).toBe(false);
    expect(p.$("#closeout-noship").hidden).toBe(false);
    expect(p.$("#closeout-sheet").hasAttribute("data-stage-continue")).toBe(false);
    expect(p.$("#closeout-stage-plan").textContent).toMatch(/B als Issue · ✕ C gestrichen$/);
    p.$("#closeout-ship").click();
    await tick();
    const body = p.last();
    expect(body).toMatchObject({
      action: "finalize", stage: "A", final: true, next: null,
      stages: [{ id: "B", route: "issue" }, { id: "C", route: "drop" }], ship: { run: true },
    });
    expect(body.disposition).toMatchObject({ mode: "discard" });
  });

  test("'Weiter mit' picks among the kept-open ones", async () => {
    const p = await live();
    const c = p.$('input[name="stage-next"][value="C"]');
    c.checked = true;
    c.dispatchEvent(new p.window.Event("change", { bubbles: true }));
    p.$("#closeout-stage-go").click();
    await tick();
    expect(p.last()).toMatchObject({ final: false, next: "C" });
  });

  test("no start control and no 'Nächste Etappe ›' on a live final report", async () => {
    const p = await live();
    p.tab("B").click();
    expect(p.$("#stage-start")).toBeNull();
    expect(p.$("#jr-next-stage")).toBeNull();
  });

  test("an untagged report and an unstaged concept submit today's payload keys exactly", async () => {
    const keys = async (p) => { p.$("#closeout-noship").click(); await tick(); return Object.keys(p.last()).sort(); };
    const today = ["action", "disposition", "handoffs", "implement", "issues", "iteration", "ship", "submission_id", "submitted", "tests", "userPins"];
    const untagged = await page({ rounds: [round(1, "A", { baked: true }), report(2, null)] });
    expect(untagged.$('[data-closeout-group="stages"]')?.hidden ?? true).toBe(true);
    expect(untagged.$("#closeout-stage-go").hidden).toBe(true);
    expect(await keys(untagged)).toEqual(today);
    const plain = await page({ stages: null, rounds: [round(1, null, { baked: true }), report(2, null)] });
    expect(await keys(plain)).toEqual(today);
  });
});
