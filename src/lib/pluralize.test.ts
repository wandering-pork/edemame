import { describe, it, expect } from 'vitest';
import { pluralize, countLabel } from './pluralize';

describe('pluralize', () => {
  it('returns the singular noun for a count of 1', () => {
    expect(pluralize(1, 'task')).toBe('task');
  });

  it('returns the default plural (noun + "s") for any other count', () => {
    expect(pluralize(0, 'task')).toBe('tasks');
    expect(pluralize(2, 'task')).toBe('tasks');
    expect(pluralize(-1, 'task')).toBe('tasks');
  });

  it('uses an explicit irregular plural when given one', () => {
    expect(pluralize(1, 'match')).toBe('match');
    expect(pluralize(2, 'match', 'matches')).toBe('matches');
  });
});

describe('countLabel', () => {
  it('formats "N noun" for singular', () => {
    expect(countLabel(1, 'task')).toBe('1 task');
  });

  it('formats "N nouns" for plural', () => {
    expect(countLabel(2, 'task')).toBe('2 tasks');
    expect(countLabel(0, 'task')).toBe('0 tasks');
  });

  it('supports an explicit irregular plural', () => {
    expect(countLabel(3, 'match', 'matches')).toBe('3 matches');
  });
});
