import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const dk = f => fs.readFileSync(path.join(__dirname, 'deep-knowledge', f), 'utf8');
const JS = dk('templates-analysis-js.md');
const CSS = dk('templates-analysis-css.md');

// renderNotes, verbatim from the template, run against a tiny DOM with its collaborators stubbed.
const src = (() => {
  const a = JS.indexOf('  function renderNotes(inst, st) {');
  const b = JS.indexOf('  /** One chat message of the user', a);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return JS.slice(a, b);
})();

function setup(html) {
  const dom = new JSDOM('<body>' + html + '</body>');
  const document = dom.window.document;
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const noteRow = (inst, st, m) => h('div', 'an-bub-me an-note-m', m);
  const factory = new Function('h', 'storeOf', 'msgsOf', 'frozen', 'noteRow', src + '; return renderNotes;');
  const renderNotes = factory(h, () => ({}), () => ['Kommentar'], () => false, noteRow);
  return { document, renderNotes };
}

describe('analysis notes position', () => {
  it('briefing: the note box comes after the topic cards, before the Los-geht\'s row (outside the stage)', () => {
    const { document, renderNotes } = setup(
      '<div class="an-chat"><section class="an-stage an-brief"><div class="an-eyebrow">E</div><div class="an-chips"><div>c</div></div></section>' +
      '<div class="an-foot an-foot-brief"><button>Los geht\'s</button></div></div>');
    const st = { kind: 'brief', el: document.querySelector('.an-brief') };
    renderNotes({}, st);
    const kids = [...st.el.children].map(c => c.className);
    expect(kids).toEqual(['an-eyebrow', 'an-chips', 'an-notes']);
    const box = st.el.querySelector('.an-notes');
    expect(box.compareDocumentPosition(document.querySelector('.an-foot-brief')) & 4).toBeTruthy(); // foot follows
  });
  it('briefing CSS: the box has an order after every ordered child, so flex does not lift it above the eyebrow', () => {
    const orders = [...CSS.matchAll(/\.(?:an-eyebrow|an-chips|an-big|an-claim)\b[^{]*\{[^}]*?\border: (\d+)/g)].map(m => +m[1]);
    const notes = /\.an-brief > \.an-notes \{[^}]*\border: (\d+)/.exec(CSS);
    expect(notes, 'briefing notes rule').toBeTruthy();
    expect(Math.max(...orders)).toBeGreaterThan(0);
    expect(+notes[1]).toBeGreaterThan(Math.max(...orders));
  });
  it('decision stage: the note box still sits right before its .an-foot', () => {
    const { document, renderNotes } = setup('<section class="an-stage"><div class="q">Q</div><div class="an-foot">Weiter</div></section>');
    const st = { kind: 'dec', el: document.querySelector('section') };
    renderNotes({}, st);
    expect([...st.el.children].map(c => c.className)).toEqual(['q', 'an-notes', 'an-foot']);
  });
});
