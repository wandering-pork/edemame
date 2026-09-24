import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { toLocalISODate } from './dates';

describe('toLocalISODate', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    // Force the process into Australia/Sydney so a UTC-based implementation
    // (toISOString().split('T')[0]) would disagree with the local calendar date.
    process.env.TZ = 'Australia/Sydney';
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('uses the local calendar date, not the UTC one, early in the morning', () => {
    // 2026-06-15 00:30 AEST is still 2026-06-14 14:30 UTC (AEST = UTC+10, no DST in June).
    const d = new Date(2026, 5, 15, 0, 30, 0);
    expect(toLocalISODate(d)).toBe('2026-06-15');
    // Sanity: prove the naive UTC-based approach would have gotten this wrong.
    expect(d.toISOString().split('T')[0]).toBe('2026-06-14');
  });

  it('uses the local calendar date late at night', () => {
    const d = new Date(2026, 5, 14, 23, 45, 0);
    expect(toLocalISODate(d)).toBe('2026-06-14');
  });

  it('pads single-digit months and days', () => {
    const d = new Date(2026, 0, 5, 9, 0, 0);
    expect(toLocalISODate(d)).toBe('2026-01-05');
  });

  it('defaults to the current local date when called with no argument', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(toLocalISODate()).toBe(expected);
  });
});
