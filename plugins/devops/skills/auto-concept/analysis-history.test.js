import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const dk = f => fs.readFileSync(path.join(__dirname, 'deep-knowledge', f), 'utf8');
const CSS = dk('templates-analysis-css.md');
const JS2 = dk('templates-analysis-js-2.md');
const PANEL = dk('templates-panel-state-3.md');

describe('analysis chat: history, own messages, composer clearance, toast', () => {
  it('keeps answered questions in the chat and shows the answer as a right-aligned user message', () => {
    expect(JS2).toMatch(/classList\.toggle\('an-past', past\)/);
    expect(JS2).toMatch(/function fillMe\(/);
    expect(CSS).toMatch(/\.an-past > \.an-m-a \{ display: none; \}/);
    expect(CSS).toMatch(/\.an-m-me \{ display: flex; justify-content: flex-end;/);
  });
  it('scrolls the open stage to the top of the chat and keeps the answer foot above the composer', () => {
    expect(JS2).toMatch(/function toStage\(/);
    expect(JS2).toMatch(/classList\.contains\('an-m-a'\) \? toBottom/);
    expect(CSS).toMatch(/\.an-chat > \*, \.an-chat \.an-stage \{ flex: 0 0 auto; \}/);
  });
  it('plays the entry sequence under reduced motion as a plain fade', () => {
    expect(JS2).not.toMatch(/const first = !inst\.seen\.has\(i\) && !reduced\(\)/);
    expect(CSS).toMatch(/\[data-analysis\] \.an-enter[^{]*\{ animation: an-fade/);
  });
  it('drops the round label and puts the toast right above the notes field', () => {
    expect(PANEL).toMatch(/\.panel-head \.panel-here-round \{ display: none !important; \}/);
    expect(PANEL).not.toMatch(/--round-dot/);
    expect(PANEL).toMatch(/bottom: calc\(var\(--an-comp-top, 1\.25rem\) \+ 14px\)/);
    expect(JS2).toMatch(/setProperty\('--an-comp-top'/);
  });
});
