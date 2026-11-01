# Concept templates, part 39 of 48: Shared systems — tooltips, theme toggle

## App Tooltips

Page chrome on every template, like the theme toggle below: no element of a
concept page uses the native `title` attribute — it renders in the OS look,
its delay cannot be set and it never opens on keyboard focus
(`ui-defaults.md` R0/R1, gate 48b). Every hover hint is `data-tip="…"`, and
this engine renders it in the page's own tokens with the two delay tiers:
**Info** (1500 ms) is the default; **Label** (500 ms) applies only when the
tip is the element's only name (an icon-only control), shows cut-off text, or
explains a disabled control. The engine detects those three cases itself;
`data-tip-tier="label"` / `"info"` overrides the detection (e.g. `info` on a
universal ✕); `data-tip-tier="help"` (0 ms) is reserved for an "i" / "?"
button that exists only for its tip. A tip never repeats a visible label: an
item with a visible name gets only its hotkey via `data-tip-key` +
`data-tip-key-only`, and siblings of one group carry the same kind of tip
(ui-defaults R1). Once a tip has closed, the next one opens instantly within
300 ms; keyboard focus opens it instantly; the pointer can move onto it;
Escape, a click or a scroll closes it; touch opens it on long-press. A stray
`title` — page content Claude writes, an older script — is moved to
`data-tip` on sight, so the OS tooltip can never appear.

**Hotkey hints ride in the same tooltip** (ui-defaults R4b): an element with
`data-tip-key="1"` (parts joined by `+`, e.g. `⇧+1`, `Strg+Enter`) gets the
key as app-styled `<kbd class="app-kbd">` caps after its label — "Cockpit
[1]" — in ONE tooltip. There is never a second floating keycap badge next to
the element. Pair it with `aria-keyshortcuts` on the element.

```css
.app-tip {
  position: fixed;
  z-index: 10000;
  max-width: min(320px, calc(100vw - 16px));
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--panel-bg, #161b22);
  color: var(--text-color, #e6edf3);
  border: 1px solid var(--border-color, #30363d);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-line;
  overflow-wrap: anywhere;
  opacity: 0;
  transition: opacity 120ms ease;
}
.app-tip[data-open] { opacity: 1; }
.app-tip[hidden] { display: none; }
@media (prefers-reduced-motion: reduce) { .app-tip { transition: none; } }
```

```javascript
(function wireAppTooltips() {
  if (window.__appTooltips) return;
  window.__appTooltips = true;
  const DELAY = { info: 1500, label: 500, help: 0 };  // R1 tiers — Info is the default; help = an "i"/"?" button that exists only for its tip
  const SKIP_MS = 300;                        // the next tip opens instantly
  const NO_ADOPT = /^(IFRAME|FRAME|LINK|STYLE|META)$/;
  const SYMBOLIC = /^[\s\p{Extended_Pictographic}\p{S}\p{P}‍️]*$/u;
  const tip = document.createElement('div');
  tip.className = 'app-tip';
  tip.id = 'app-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  let owner = null, openTimer = 0, closeTimer = 0, pressTimer = 0, lastClose = 0;

  // A native title would put the OS tooltip on top of ours: move it to
  // data-tip and keep an accessible name on an otherwise empty control.
  function adopt(el) {
    if (!el || el.nodeType !== 1 || NO_ADOPT.test(el.tagName) || !el.hasAttribute('title')) return;
    const text = el.getAttribute('title');
    el.removeAttribute('title');
    if (!text) return;
    if (!el.dataset.tip) el.dataset.tip = text;
    if (!el.hasAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', text);
  }

  function tierOf(el) {
    const forced = el.getAttribute('data-tip-tier');
    if (forced === 'label' || forced === 'info' || forced === 'help') return forced;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return 'label';
    if (el.matches('button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="menuitem"], [tabindex]')
      && SYMBOLIC.test(el.textContent || '')) return 'label';
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow === 'ellipsis') return 'label';
    return 'info';
  }

  function describe(el, on) {
    const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/)
      .filter((id) => id && id !== tip.id);
    if (on) ids.push(tip.id);
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
    else el.removeAttribute('aria-describedby');
  }

  function place(el) {
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight, gap = 8;
    let top = r.top - h - gap;
    if (top < 4) top = r.bottom + gap;
    const left = Math.max(4, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 4));
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
  }

  // Label text plus, for `data-tip-key`, one keycap per key part.
  // `data-tip-key-only`: the element's label is already visible, so the tip
  // carries only its keycaps — never an echo of the label (ui-defaults R1).
  function fill(el) {
    const keyOnly = el.hasAttribute('data-tip-key-only');
    tip.textContent = keyOnly ? '' : el.dataset.tip;
    const key = el.dataset.tipKey;
    if (!key) return;
    if (!keyOnly) tip.appendChild(document.createTextNode(' '));
    key.split('+').forEach((part, i) => {
      if (i) tip.appendChild(document.createTextNode('+'));
      const cap = document.createElement('kbd');
      cap.className = 'app-kbd';
      cap.textContent = part;
      tip.appendChild(cap);
    });
  }

  function show(el) {
    const text = el.dataset.tip;
    if (!text || !el.isConnected) return;
    if (!tip.isConnected) document.body.appendChild(tip);
    if (owner && owner !== el) describe(owner, false);
    owner = el;
    fill(el);
    tip.hidden = false;
    place(el);
    tip.setAttribute('data-open', '');
    describe(el, true);
  }

  function hide() {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    if (!owner) return;
    describe(owner, false);
    owner = null;
    tip.removeAttribute('data-open');
    tip.hidden = true;
    lastClose = Date.now();
  }

  function schedule(el, instant) {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    if (owner === el) return;
    if (owner) hide();
    const wait = instant || Date.now() - lastClose < SKIP_MS ? 0 : DELAY[tierOf(el)];
    openTimer = setTimeout(() => show(el), wait);
  }

  const triggerOf = (node) => (node instanceof Element ? node.closest('[data-tip]') : null);

  function boot() {
    document.querySelectorAll('[title]').forEach(adopt);
    new MutationObserver((records) => {
      for (const rec of records) {
        if (rec.type === 'attributes') {
          if (rec.attributeName === 'title') adopt(rec.target);
          else if (rec.target === owner) {
            if (owner.dataset.tip) { fill(owner); place(owner); } else hide();
          }
          continue;
        }
        rec.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          adopt(n);
          n.querySelectorAll('[title]').forEach(adopt);
        });
      }
    }).observe(document.documentElement,
      { subtree: true, childList: true, attributes: true, attributeFilter: ['title', 'data-tip', 'data-tip-key'] });
  }

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    if (tip.contains(e.target)) { clearTimeout(closeTimer); return; }
    const el = triggerOf(e.target);
    if (el) schedule(el, false);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'touch') return;
    const to = e.relatedTarget;
    if (to instanceof Node && (tip.contains(to) || (owner && owner.contains(to)))) return;
    if (!triggerOf(e.target) && !tip.contains(e.target)) return;
    clearTimeout(openTimer);
    if (owner) closeTimer = setTimeout(hide, 120);
  });
  // Keyboard focus opens instantly; focus from a click does not (the pointer
  // runs its own delay), so the last input modality decides.
  let viaKeyboard = false;
  document.addEventListener('focusin', (e) => {
    const el = triggerOf(e.target);
    if (el && viaKeyboard) schedule(el, true);
  });
  document.addEventListener('focusout', (e) => { if (owner && owner.contains(e.target)) hide(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
    else viaKeyboard = true;
  }, true);
  document.addEventListener('pointerdown', (e) => {
    viaKeyboard = false;
    if (!tip.contains(e.target)) hide();
    if (e.pointerType !== 'touch') return;
    const el = triggerOf(e.target);
    if (el) pressTimer = setTimeout(() => show(el), DELAY.label);
  }, true);
  ['pointerup', 'pointercancel'].forEach((type) =>
    document.addEventListener(type, () => clearTimeout(pressTimer), true));
  window.addEventListener('scroll', hide, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
```

## Theme Toggle

The page defaults to **dark** (`<html data-theme="dark">`, see § Common
Structure); a project's `reference.md` may override the default, the user's
choice is persisted as `state['theme']` (§ State Persistence). The control is
`#theme-toggle` in the ☰ panel's `.panel-head` row — page chrome on every
template, never in the content column, never a FAB (the two FABs are a closed
pair, gate P13). It flips `data-theme` and names the NEXT action: while dark
the ☀️ glyph shows (CSS, § Panel Chrome) and the tooltip reads
`{{theme.to_light}}`; while light, 🌙 and `{{theme.to_dark}}`.

```javascript
// Null-guarded (#341): a page whose panel predates the head row has no
// #theme-toggle, and an unguarded dereference here threw at boot and took the
// rest of the script with it — the tab-switch boot never ran, so the "you are
// here" head stayed empty until the first manual tab click.
(() => {
  const html = document.documentElement;
  const wire = () => {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    // Tooltip + a11y label name the NEXT action, exactly like the ☰/💬 FABs.
    // Read off the button's own dataset — the locale substitution happened
    // once, at generation time, in the markup. The glyph is CSS
    // (html[data-theme] → [data-glyph]), so nothing here touches the spans.
    const sync = () => {
      const next = html.getAttribute('data-theme') === 'dark' ? btn.dataset.labelLight : btn.dataset.labelDark;
      if (!next) return;
      btn.setAttribute('data-tip', next);
      btn.setAttribute('aria-label', next);
    };
    btn.addEventListener('click', () => {
      const current = html.getAttribute('data-theme');
      html.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
      sync();
      // § State Persistence saves on `change`/`input`; a <button> click fires
      // neither, so the choice would only reach localStorage with the user's
      // next keystroke — and a reload in between reverted the theme. Same
      // explicit-save pattern as showScreen()/applyViewport().
      if (typeof saveState === 'function') saveState();
    });
    // data-theme has more than one writer: restoreState() sets it on load
    // (and again on the bridge draft restore), so the label follows the
    // attribute itself rather than only this button's click.
    new MutationObserver(sync).observe(html, { attributes: true, attributeFilter: ['data-theme'] });
    sync();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
```


## Neural Backdrop

A very quiet backdrop behind document rounds (decision / free, analysis
included): biological neurons, not a star chart of dots and straight lines.
Each cell is a slightly irregular **soma**, a **dendritic arbor** (four to six
primary dendrites that curve and fork twice, thinner by order; about half carry
a longer apical dendrite), and most carry one **axon** — thin, even, a smooth
curve to a neighbour in the same depth plane, ending in short terminal branches
with a **bouton** (the synapse) inside the target's arbor. Three depth planes
(back small and pale, front larger and sharper) shift with the mouse by depth;
axons stay within one plane, so the parallax never tears a connection.
Impulses run along the axons and the target soma swells briefly as one
arrives. Morphology after the MadMaze phase transitions (`neural-net.ts`).

It is decoration, so it never competes with the text: low alpha, accent colour
only, `pointer-events: none`, behind every element (`z-index: -1`, the body
background propagates to the canvas below it). Off on design rounds (the mock
is the stage), static under `prefers-reduced-motion`, paused while the tab is
hidden, ~30 fps; the tissue is pre-rendered once per plane, so a frame only
draws three bitmaps plus the impulses.

```css
#neural-bg { position: fixed; inset: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none; opacity: .5; }
html[data-theme="light"] #neural-bg { opacity: .32; }
html[data-template="design"] #neural-bg { display: none; }
@media print { #neural-bg { display: none; } }
```

```javascript
(function mountNeuralBackdrop() {
  if (!window.HTMLCanvasElement || !window.Path2D || document.getElementById('neural-bg')) return;
  const cv = document.createElement('canvas');
  cv.id = 'neural-bg';
  cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const off = () => document.documentElement.dataset.template === 'design';
  // Back -> front: drawn size, share of cells, tissue alpha, parallax depth.
  const PLANES = [{ s: 0.55, share: 0.42, a: 0.45, z: 0.35 }, { s: 0.8, share: 0.34, a: 0.7, z: 0.65 }, { s: 1.1, share: 0.24, a: 1, z: 1 }];
  const PAD = 40;
  let W = 0, H = 0, dpr = 1, cells = [], layers = [], spikes = [], rgb = '88,166,255';
  let mx = 0, my = 0, px = 0, py = 0, last = 0, nextFire = 0, raf = 0;
  const r = Math.random, f = v => v.toFixed(1);
  function color() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
    const m = /^#([0-9a-f]{6})$/i.exec(v);
    if (m) { const n = parseInt(m[1], 16); rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(','); }
  }
  const planeOf = roll => { let acc = 0; for (let i = 0; i < PLANES.length; i++) { acc += PLANES[i].share; if (roll < acc) return i; } return 2; };
  // One cell: soma, dendritic arbor (3 branch orders), axon to a same-plane neighbour, terminals + boutons.
  function neuron(c, all, index) {
    const x = c.x, y = c.y, s = PLANES[c.p].s, somaR = (4.4 + r() * 2.4) * s, base = r() * Math.PI * 2;
    const pts = Array.from({ length: 6 }, (_, i) => { const a = base + i / 6 * Math.PI * 2, rr = somaR * (0.8 + r() * 0.45); return [x + Math.cos(a) * rr, y + Math.sin(a) * rr]; });
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const st = mid(pts[5], pts[0]);
    let soma = 'M' + f(st[0]) + ' ' + f(st[1]);
    pts.forEach((p, i) => { const m = mid(p, pts[(i + 1) % 6]); soma += 'Q' + f(p[0]) + ' ' + f(p[1]) + ' ' + f(m[0]) + ' ' + f(m[1]); });
    soma += 'Z';
    const dend = ['', '', ''];
    const grow = (x0, y0, ang, len, d) => {
      const bend = (r() - 0.5) * 0.9, cx = x0 + Math.cos(ang) * len * 0.5, cy = y0 + Math.sin(ang) * len * 0.5;
      const x1 = x0 + Math.cos(ang + bend) * len, y1 = y0 + Math.sin(ang + bend) * len;
      dend[d] += 'M' + f(x0) + ' ' + f(y0) + 'Q' + f(cx) + ' ' + f(cy) + ' ' + f(x1) + ' ' + f(y1);
      if (d >= 2) return;
      const head = Math.atan2(y1 - cy, x1 - cx), forks = d === 0 || r() < 0.75 ? 2 : 1;
      for (let i = 0; i < forks; i++) {
        const spread = forks === 1 ? (r() - 0.5) * 0.4 : (i === 0 ? -1 : 1) * (0.3 + r() * 0.35);
        grow(x1, y1, head + spread, len * (0.58 + r() * 0.17), d + 1);
      }
    };
    const prim = 4 + Math.floor(r() * 3), apical = r() < 0.5;
    for (let i = 0; i < prim; i++) {
      const a = base + i / prim * Math.PI * 2 + (r() - 0.5) * 0.7;
      grow(x + Math.cos(a) * somaR * 0.7, y + Math.sin(a) * somaR * 0.7, a, (22 + r() * 18) * s * (apical && i === 0 ? 1.7 : 1), 0);
    }
    const cell = { x, y, p: c.p, s, soma: new Path2D(soma), dend: dend.map(d => new Path2D(d)), axon: null, curve: null, target: -1, len: 0, term: null, bout: null, swell: 0 };
    const near = all.map((o, j) => ({ j, d: Math.hypot(o.x - x, o.y - y), p: o.p }))
      .filter(o => o.j !== index && o.p === c.p && o.d > 70 * s && o.d < 420 * s).sort((a, b) => a.d - b.d).slice(0, 3);
    if (near.length && r() < 0.88) {
      const t = near[Math.floor(r() * near.length)].j, to = all[t], toward = Math.atan2(to.y - y, to.x - x);
      const hill = toward + (r() - 0.5) * 0.9, ax = x + Math.cos(hill) * somaR, ay = y + Math.sin(hill) * somaR;
      // Stop short of the target soma, off to one side, inside its arbor.
      const land = toward + Math.PI + (r() - 0.5) * 1.2;
      const ex = to.x + Math.cos(land) * (16 + r() * 10) * s, ey = to.y + Math.sin(land) * (16 + r() * 10) * s;
      const span = Math.hypot(ex - ax, ey - ay), c1a = hill + (r() - 0.5) * 0.5, c2a = toward + (r() - 0.5);
      const c1 = [ax + Math.cos(c1a) * span * 0.38, ay + Math.sin(c1a) * span * 0.38];
      const c2 = [ex - Math.cos(c2a) * span * 0.38, ey - Math.sin(c2a) * span * 0.38];
      cell.curve = [[ax, ay], c1, c2, [ex, ey]];
      cell.axon = new Path2D('M' + f(ax) + ' ' + f(ay) + 'C' + f(c1[0]) + ' ' + f(c1[1]) + ' ' + f(c2[0]) + ' ' + f(c2[1]) + ' ' + f(ex) + ' ' + f(ey));
      cell.target = t;
      cell.len = span * 1.15;
      let term = '', bout = '';
      const head = Math.atan2(ey - c2[1], ex - c2[0]), tips = 2 + Math.floor(r() * 2), br = 1.5 * Math.max(s, 0.7);
      for (let i = 0; i < tips; i++) {
        const a = head + (i - (tips - 1) / 2) * (0.55 + r() * 0.3), len = (8 + r() * 9) * s;
        const tx = ex + Math.cos(a) * len, ty = ey + Math.sin(a) * len, qx = ex + Math.cos(head) * len * 0.5, qy = ey + Math.sin(head) * len * 0.5;
        term += 'M' + f(ex) + ' ' + f(ey) + 'Q' + f(qx) + ' ' + f(qy) + ' ' + f(tx) + ' ' + f(ty);
        bout += 'M' + f(tx - br) + ' ' + f(ty) + 'a' + f(br) + ' ' + f(br) + ' 0 1 0 ' + f(br * 2) + ' 0a' + f(br) + ' ' + f(br) + ' 0 1 0 ' + f(-br * 2) + ' 0';
      }
      cell.term = new Path2D(term);
      cell.bout = new Path2D(bout);
    }
    return cell;
  }
  // The tissue of one plane, drawn once into its own bitmap (PAD of room for the parallax).
  function paintPlane(p) {
    const c = document.createElement('canvas');
    c.width = Math.round((W + PAD * 2) * dpr); c.height = Math.round((H + PAD * 2) * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, PAD * dpr, PAD * dpr);
    g.lineCap = 'round';
    const A = PLANES[p].a, ink = a => 'rgba(' + rgb + ',' + (a * A).toFixed(3) + ')';
    cells.filter(n => n.p === p).forEach(n => {
      const w = Math.max(n.s, 0.6);
      [[2.3, 0.5], [1.4, 0.38], [0.8, 0.28]].forEach((o, d) => { g.lineWidth = o[0] * w; g.strokeStyle = ink(o[1]); g.stroke(n.dend[d]); });
      if (n.axon) {
        g.lineWidth = 1.05 * w; g.strokeStyle = ink(0.36); g.stroke(n.axon);
        g.lineWidth = 0.8 * w; g.strokeStyle = ink(0.34); g.stroke(n.term);
        g.fillStyle = ink(0.55); g.fill(n.bout);
      }
      g.fillStyle = ink(0.7); g.fill(n.soma);
    });
    return c;
  }
  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const count = Math.max(16, Math.min(56, Math.round(W * H / 30000)));
    const seeds = Array.from({ length: count }, () => ({ x: -PAD / 2 + r() * (W + PAD), y: -PAD / 2 + r() * (H + PAD), p: planeOf(r()) }));
    cells = seeds.map((c, i) => neuron(c, seeds, i));
    layers = PLANES.map((_, p) => paintPlane(p));
    spikes = [];
  }
  const bez = (c, t) => { const u = 1 - t; return [0, 1].map(k => u * u * u * c[0][k] + 3 * u * u * t * c[1][k] + 3 * u * t * t * c[2][k] + t * t * t * c[3][k]); };
  const shift = p => [px * PLANES[p].z, py * PLANES[p].z];
  function fire(i, gen) {
    const n = cells[i];
    if (n && n.axon) spikes.push({ i, t: 0, v: 260 / Math.max(n.len, 60), gen });
  }
  function draw(now) {
    raf = 0;
    if (document.hidden || off()) return;
    if (!still && now - last < 33) { raf = requestAnimationFrame(draw); return; }
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    px += (mx - px) * 0.06; py += (my - py) * 0.06;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    layers.forEach((bmp, p) => { const o = shift(p); ctx.drawImage(bmp, Math.round((o[0] - PAD) * dpr), Math.round((o[1] - PAD) * dpr)); });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    // Impulses: a short bright stretch of the axon running to the synapse, fading at its tail.
    spikes = spikes.filter(sp => {
      const n = cells[sp.i];
      sp.t += sp.v * dt;
      if (sp.t >= 1) {
        cells[n.target].swell = 1;
        if (sp.gen < 2 && r() < 0.55) fire(n.target, sp.gen + 1);
        return false;
      }
      const o = shift(n.p), A = PLANES[n.p].a;
      for (let k = 0; k < 6; k++) {
        const a = bez(n.curve, Math.max(0, sp.t - k * 0.018)), b = bez(n.curve, Math.max(0, sp.t - (k + 1) * 0.018));
        ctx.strokeStyle = 'rgba(' + rgb + ',' + ((0.9 - k * 0.14) * A).toFixed(3) + ')';
        ctx.lineWidth = (2.6 - k * 0.3) * Math.max(n.s, 0.7);
        ctx.beginPath(); ctx.moveTo(a[0] + o[0], a[1] + o[1]); ctx.lineTo(b[0] + o[0], b[1] + o[1]); ctx.stroke();
      }
      return true;
    });
    // The cell an impulse lands on swells by a breath.
    cells.forEach(n => {
      if (n.swell <= 0.02) return;
      n.swell = Math.max(0, n.swell - dt * 1.4);
      const o = shift(n.p), cx = n.x + o[0], cy = n.y + o[1], R = (10 + 16 * n.swell) * n.s;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, 'rgba(' + rgb + ',' + (0.45 * n.swell * PLANES[n.p].a).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    });
    if (still) return;
    if (now > nextFire && spikes.length < 24) {
      const axons = cells.filter(n => n.axon);
      if (axons.length) fire(cells.indexOf(axons[Math.floor(r() * axons.length)]), 0);
      nextFire = now + 500 + r() * 1200;
    }
    raf = requestAnimationFrame(draw);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(draw); };
  let resizeT = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { build(); kick(); }, 150); });
  if (!still) {
    window.addEventListener('pointermove', e => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      mx = (e.clientX / (W || 1) - 0.5) * -36; my = (e.clientY / (H || 1) - 0.5) * -36;
    }, { passive: true });
  }
  document.addEventListener('visibilitychange', kick);
  document.addEventListener('iteration:changed', kick);
  if (window.MutationObserver) new MutationObserver(() => { color(); layers = PLANES.map((_, p) => paintPlane(p)); kick(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-template'] });
  color(); build(); kick();
})();
```
