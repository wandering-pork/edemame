import { describe, expect, it } from 'vitest';
import { pruneSelection, toggleAll, toggleSelection } from './caseSelection';

const ids = ['a', 'b', 'c', 'd', 'e'];

describe('toggleSelection', () => {
  it('toggles one row', () => {
    expect([...toggleSelection(new Set(), ids, 'b', null, false)]).toEqual(['b']);
    expect([...toggleSelection(new Set(['b']), ids, 'b', 'b', false)]).toEqual([]);
  });

  it('shift-click selects the range from the last click, either direction', () => {
    expect([...toggleSelection(new Set(['b']), ids, 'd', 'b', true)].sort()).toEqual(['b', 'c', 'd']);
    expect([...toggleSelection(new Set(['d']), ids, 'b', 'd', true)].sort()).toEqual(['b', 'c', 'd']);
  });

  it('shift-click on a selected row clears the range', () => {
    expect([...toggleSelection(new Set(['a', 'b', 'c', 'd']), ids, 'c', 'a', true)]).toEqual(['d']);
  });

  it('falls back to a single toggle when the anchor is no longer visible', () => {
    expect([...toggleSelection(new Set(), ids, 'c', 'zz', true)]).toEqual(['c']);
  });
});

describe('pruneSelection', () => {
  it('keeps the same Set when everything is still visible', () => {
    const s = new Set(['a', 'c']);
    expect(pruneSelection(s, ids)).toBe(s);
  });

  it('drops rows that are no longer visible', () => {
    expect([...pruneSelection(new Set(['a', 'x']), ids)]).toEqual(['a']);
  });
});

describe('toggleAll', () => {
  it('selects every visible row, then clears', () => {
    expect(toggleAll(new Set(['a']), ids).size).toBe(5);
    expect(toggleAll(new Set(ids), ids).size).toBe(0);
    expect(toggleAll(new Set(), []).size).toBe(0);
  });
});
