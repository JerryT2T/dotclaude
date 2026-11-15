import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';

const require = createRequire(import.meta.url);
const B = require('../hooks/lib/batch-state.js');
const { fileNote } = require('./batch-note.js');
const SCRIPT = path.join(__dirname, 'batch-note.js');

// 1x1 transparent PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let cwd;
beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-note-'));
  B.activate(cwd, { sessionId: 'sess-1' });
});
afterEach(() => { fs.rmSync(cwd, { recursive: true, force: true }); });

const req = (over = {}) => ({ cwd, sessionId: 'sess-1', text: 'a note', ...over });
const assets = () => { try { return fs.readdirSync(B.assetsDir(cwd)).filter(f => /\.(png|jpg|gif|webp)$/.test(f)); } catch { return []; } };

describe('batch-note: filing', () => {
  it('files a text note in the hook format and returns the number', () => {
    expect(fileNote(req())).toEqual({ ok: true, n: 1, images: 0 });
    expect(fileNote(req({ text: 'second' })).n).toBe(2);
    expect(B.readNotes(cwd).map(n => n.text)).toEqual(['a note', 'second']);
  });

  it('keeps a very long prompt whole', () => {
    const text = `${'lorem ipsum '.repeat(20000)}END`;
    expect(fileNote(req({ text })).ok).toBe(true);
    expect(B.readNotes(cwd)[0].text.endsWith('END')).toBe(true);
  });

  it('files images first and names them as [Anhang-Datei] lines under .claude/batch-assets', () => {
    const r = fileNote(req({ text: 'siehe Bild', attachments: [{ mediaType: 'image/png', base64: PNG }, { name: 'b.jpg', base64: PNG }] }));
    expect(r).toEqual({ ok: true, n: 1, images: 2 });
    const text = B.readNotes(cwd)[0].text;
    const lines = text.split('\n').filter(l => l.startsWith('[Anhang-Datei] '));
    expect(lines.length).toBe(2);
    for (const l of lines) {
      const f = l.slice('[Anhang-Datei] '.length);
      expect(path.dirname(f)).toBe(B.assetsDir(cwd));
      expect(fs.readFileSync(f).equals(Buffer.from(PNG, 'base64'))).toBe(true);
    }
  });

  it('files an image-only prompt and an @file mention (existing file named, text verbatim)', () => {
    expect(fileNote(req({ text: '', attachments: [{ mediaType: 'image/png', base64: PNG }] })).ok).toBe(true);
    fs.writeFileSync(path.join(cwd, 'spec.md'), 'x');
    expect(fileNote(req({ text: 'siehe @spec.md bitte' })).ok).toBe(true);
    const notes = B.readNotes(cwd);
    expect(notes[1].text).toContain('siehe @spec.md bitte');
    expect(notes[1].text).toContain(`[Anhang-Datei] ${path.join(cwd, 'spec.md')}`);
  });

  it('files pasted text and [Image #1] placeholders verbatim', () => {
    const text = '[Image #1] schau\n```\nzeile 1\nzeile 2\n```';
    expect(fileNote(req({ text, attachments: [{ mediaType: 'image/png', base64: PNG }] })).ok).toBe(true);
    expect(B.readNotes(cwd)[0].text.startsWith(text)).toBe(true);
  });
});

describe('batch-note: refusals leave everything to the hook (nothing written)', () => {
  const none = () => expect(B.readNotes(cwd)).toEqual([]);

  it('mode off, expired and full', () => {
    B.deactivate(cwd);
    expect(fileNote(req())).toEqual({ ok: false, reason: 'inactive' });
    B.activate(cwd, { sessionId: 'sess-1', startedAt: '2020-01-01T00:00:00Z' });
    expect(fileNote(req()).reason).toBe('expired');
    B.activate(cwd, { sessionId: 'sess-1', maxNotes: 1 });
    expect(fileNote(req()).ok).toBe(true);
    expect(fileNote(req({ text: 'two' })).reason).toBe('full');
    expect(B.readNotes(cwd).length).toBe(1);
  });

  it('another session owns the notes (#841)', () => {
    expect(fileNote(req({ sessionId: 'other' })).reason).toBe('foreign');
    none();
  });

  it('never machine prompts, slash commands, the execute marker or /do-batch routes', () => {
    const marker = B.effectiveMarker(cwd);
    for (const text of [
      '<task-notification>x</task-notification>', 'AUTONOMOUS_RESUME: go', '<command-name>/x</command-name>',
      '/compact', '/do-batch off', '/do-batch go', '/do-batch status', `${marker} mach jetzt`,
    ]) {
      expect(fileNote(req({ text })).ok, text).toBe(false);
    }
    none();
  });

  it('empty input, bad cwd, bad request', () => {
    expect(fileNote(req({ text: '  ' })).reason).toBe('empty');
    expect(fileNote(req({ cwd: 'relative' })).reason).toBe('bad-cwd');
    expect(fileNote(null).reason).toBe('bad-request');
    none();
  });
});

describe('batch-note: image failure never half-files', () => {
  it('an unsupported / empty attachment aborts the whole filing and removes the copies already written', () => {
    for (const bad of [{ mediaType: 'application/pdf', base64: PNG }, { mediaType: 'image/png', base64: '' }]) {
      const r = fileNote(req({ attachments: [{ mediaType: 'image/png', base64: PNG }, bad] }));
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/^write-failed/);
    }
    expect(B.readNotes(cwd)).toEqual([]);
    expect(assets()).toEqual([]);
  });

  it('an assets folder that cannot be created aborts without a note', () => {
    fs.writeFileSync(B.assetsDir(cwd), 'a file where the folder should be');
    const r = fileNote(req({ attachments: [{ mediaType: 'image/png', base64: PNG }] }));
    expect(r.ok).toBe(false);
    expect(B.readNotes(cwd)).toEqual([]);
  });
});

describe('batch-note: idempotency', () => {
  it('the same key within the window answers with the first note instead of filing twice', () => {
    const t = Date.now();
    expect(fileNote(req({ key: 'k1' }), t)).toEqual({ ok: true, n: 1, images: 0 });
    expect(fileNote(req({ key: 'k1' }), t + 1000)).toEqual({ ok: true, n: 1, images: 0, deduped: true });
    expect(B.readNotes(cwd).length).toBe(1);
    expect(fileNote(req({ key: 'k1' }), t + 60_000).deduped).toBeUndefined(); // window over: a new note
    expect(B.readNotes(cwd).length).toBe(2);
  });
});

describe('batch-note: process entry', () => {
  const run = (input) => spawnSync(process.execPath, [SCRIPT], { input, encoding: 'utf8' });

  it('prints one JSON line and exits 0 only on success', () => {
    const ok = run(JSON.stringify(req()));
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout.trim())).toMatchObject({ ok: true, n: 1 });
    const refused = run(JSON.stringify(req({ sessionId: 'other' })));
    expect(refused.status).toBe(1);
    expect(JSON.parse(refused.stdout.trim())).toEqual({ ok: false, reason: 'foreign' });
  });

  it('garbage stdin is a refusal, not a crash', () => {
    const r = run('not json');
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout.trim()).ok).toBe(false);
  });

  it('concurrent writers lose no note and no image', async () => {
    const N = 8;
    const runs = Array.from({ length: N }, (_, i) => new Promise((resolve) => {
      const child = spawn(process.execPath, [SCRIPT], { stdio: ['pipe', 'pipe', 'ignore'] });
      let out = '';
      child.stdout.on('data', d => { out += d; });
      child.on('close', code => resolve({ code, out }));
      child.stdin.end(JSON.stringify(req({ text: `concurrent ${i}`, attachments: [{ mediaType: 'image/png', base64: PNG }] })));
    }));
    const results = await Promise.all(runs);
    expect(results.every(r => r.code === 0 && JSON.parse(r.out.trim()).ok)).toBe(true);
    const texts = B.readNotes(cwd).map(n => n.text);
    expect(texts.length).toBe(N);
    for (let i = 0; i < N; i++) expect(texts.some(t => t.startsWith(`concurrent ${i}\n[Anhang-Datei]`))).toBe(true);
    expect(new Set(assets()).size).toBe(N); // every image its own file
  }, 30000);
});
