import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const hook = require('../user-prompt-submit/prompt.flow.title-work.js');
const { titlePlan, replyOf } = require('./title-plan.js');
const { isFreshSession } = require('./session-title.js');

// Recorded from the hook BEFORE the #1102 Part A extraction: the refactored hook must answer byte for byte the same.
const CASES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'title-work-parity.json'), 'utf8'));

let dir;
let T;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'titlefx-'));
  const fresh = path.join(dir, 'fresh.jsonl');
  fs.writeFileSync(fresh, JSON.stringify({ type: 'user', message: { content: 'hi' } }) + '\n');
  const long = path.join(dir, 'long.jsonl');
  fs.writeFileSync(long, Array.from({ length: 40 }, (_, i) => JSON.stringify({ type: i % 2 ? 'assistant' : 'user', message: { content: 'x'.repeat(9000) } })).join('\n') + '\n');
  T = { none: path.join(dir, 'missing.jsonl'), fresh, long };
  // The fixtures were recorded while a batch head always stayed: that is the armed case (an unarmed one strips it).
  require('./batch-state.js').activate(dir);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('title-plan parity with prompt.flow.title-work (#1102 Part A)', () => {
  it('has a meaningful fixture table', () => {
    expect(CASES.length).toBe(180);
    expect(CASES.filter(c => c.out === '').length).toBeGreaterThan(0);
    expect(CASES.filter(c => c.out.startsWith('{')).length).toBeGreaterThan(0);
  });

  it('the hook answers every fixture byte-identical', () => {
    for (const c of CASES) {
      const h = { session_id: 's1', transcript_path: T[c.transcript], cwd: dir };
      if (c.title !== null) h.session_title = c.title;
      expect(hook.hookReply(h, c.prompt, dir), JSON.stringify({ t: c.transcript, title: c.title, prompt: c.prompt })).toBe(c.out);
    }
  });

  it('the pure plan alone (no hook, inputs as plain values) gives the same answer', () => {
    for (const c of CASES) {
      const current = c.title === null || c.title === '' ? (c.title === '' ? '' : null) : c.title;
      // The hook reads an empty reported title as unknown and falls back to the transcript (none here).
      const cur = current === '' ? null : current;
      const plan = titlePlan({
        prompt: c.prompt,
        current: cur,
        firstPrompt: c.transcript === 'none',
        fresh: cur === null ? isFreshSession(T[c.transcript]) : false,
      });
      expect(replyOf(plan)).toBe(c.out);
    }
  });
});

describe('titlePlan - the 🔗 of a linked sub (concept 2026-11-21 rows 1, 12, 13)', () => {
  const NL = String.fromCharCode(10);
  const brief = 'Background (from the session "Backlog"): do it' + NL + '[devops:handoff]';
  it('a sub brief on the first prompt: the app title gets 🔗 ⏳ ➜ 🤖 Solo ┃', () => {
    const plan = titlePlan({ prompt: brief, current: 'Dismantle', firstPrompt: true, fresh: false });
    expect(plan.sessionTitle).toBe('🔗 ⏳ ➜ 🤖 Solo ┃ Dismantle');
  });
  it('a later prompt keeps the 🔗 through the title', () => {
    const plan = titlePlan({ prompt: 'weiter', current: '🔗 🟩 ➜ 🚀 Released Alpha ┃ X', firstPrompt: false, fresh: false });
    expect(plan.context).toContain('🔗 ⏳ ➜ 🤖 Solo ┃ X');
  });
  it('an unmarked first prompt gets the normal head without 🔗', () => {
    const plan = titlePlan({ prompt: 'Fix the login', current: 'Fix', firstPrompt: true, fresh: false });
    expect(plan.sessionTitle).toBe('⏳ ➜ 🤖 Solo ┃ Fix');
  });
  it('a marker mentioned in a later user prompt does not make a sub', () => {
    const plan = titlePlan({ prompt: 'explain [devops:handoff]', current: '🟩 ➜ 📦 Committed ┃ X', firstPrompt: false, fresh: false });
    expect(plan.context).not.toContain('🔗');
  });
});
