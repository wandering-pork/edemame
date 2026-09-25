import { describe, it, expect } from 'vitest';
import { quickMoveDate } from './quickMoveDate';

describe('quickMoveDate', () => {
  it('moves the date forward by one day', () => {
    expect(quickMoveDate('2026-06-15', '+1d')).toBe('2026-06-16');
  });

  it('moves the date forward by one week', () => {
    expect(quickMoveDate('2026-06-15', '+1w')).toBe('2026-06-22');
  });

  it('crosses a month boundary correctly', () => {
    expect(quickMoveDate('2026-06-28', '+1w')).toBe('2026-07-05');
  });

  it('is relative to the task\'s own due date, not today', () => {
    expect(quickMoveDate('2026-01-01', '+1d')).toBe('2026-01-02');
  });
});
