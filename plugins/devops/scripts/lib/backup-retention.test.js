import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { selectKeepDays, isoWeekKey } = require('./backup-retention.js');

const keep = (...a) => [...selectKeepDays(...a)].sort();

describe('isoWeekKey', () => {
  it('handles week and year boundaries', () => {
    expect(isoWeekKey('2026-10-04')).toBe('2026-W40'); // Sunday
    expect(isoWeekKey('2026-10-05')).toBe('2026-W41'); // Monday
    expect(isoWeekKey('2026-12-31')).toBe('2026-W53');
    expect(isoWeekKey('2027-01-03')).toBe('2026-W53');
    expect(isoWeekKey('2027-01-04')).toBe('2027-W01');
    expect(isoWeekKey('2024-12-30')).toBe('2025-W01');
  });
});

describe('selectKeepDays', () => {
  const days = ['2026-10-01', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-12', '2026-10-13', '2026-10-19'];

  it('keeps only the newest keepDays days when weekly anchors are off', () => {
    expect(keep(days, 2, 0)).toEqual(['2026-10-13', '2026-10-19']);
  });

  it('adds the first day of each recent ISO week, Sunday and Monday being different weeks', () => {
    expect(keep(days, 1, 4)).toEqual(['2026-10-01', '2026-10-05', '2026-10-12', '2026-10-19']);
  });

  it('limits anchors to the newest keepWeeks weeks', () => {
    expect(keep(days, 1, 2)).toEqual(['2026-10-12', '2026-10-19']);
  });

  it('works across the year boundary and ignores duplicates and junk', () => {
    const d = ['2026-12-29', '2026-12-31', '2027-01-01', '2027-01-04', '2027-01-04', 'tmp', '.x'];
    expect(keep(d, 1, 4)).toEqual(['2026-12-29', '2027-01-04']);
  });

  it('keeps everything when the window is wider than the data, and nothing for no days', () => {
    expect(keep(days, 99, 0)).toEqual([...days].sort());
    expect(keep([], 14, 4)).toEqual([]);
  });
});
