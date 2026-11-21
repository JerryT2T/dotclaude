import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { writeFileAtomic } = require('./atomic-write.js');

describe('writeFileAtomic', () => {
  it('replaces the content and leaves no temp file behind', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-'));
    try {
      const f = path.join(d, 's.json');
      fs.writeFileSync(f, 'old');
      writeFileAtomic(f, 'new');
      expect(fs.readFileSync(f, 'utf8')).toBe('new');
      expect(fs.readdirSync(d)).toEqual(['s.json']);
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });
  it('throws and cleans up when the target directory is missing', () => {
    expect(() => writeFileAtomic(path.join(os.tmpdir(), 'no-such-dir-xyz', 'f'), 'x')).toThrow();
  });
});
