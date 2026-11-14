import { describe, it, expect } from 'vitest';
import { NOT_CONFIRMED_SUBCLASS, type VisaType } from '../types';
import {
  SYSTEM_VISA_TYPES,
  ensureSystemVisaTypes,
  formatSubclass,
  isConfirmedSubclass,
  isEditedDefault,
  resetVisaType,
  subclassOptions,
  substreamAfterSubclassChange,
  substreamsFor,
  validateVisaType,
} from './visaTypes';

const memRepo = (initial: VisaType[] = []) => {
  let rows = [...initial];
  return {
    rows: () => rows,
    getAll: async () => rows,
    createMany: async (items: VisaType[]) => { rows = [...rows, ...items]; return items; },
  };
};

const seeded = async () => ensureSystemVisaTypes(memRepo());

describe('ensureSystemVisaTypes', () => {
  it('seeds one row per shipped subclass + substream', async () => {
    const types = await seeded();
    expect(types).toHaveLength(SYSTEM_VISA_TYPES.length);
    expect(types.every(t => t.isSystemDefault && !t.hidden && t.systemKey)).toBe(true);
  });

  it('is idempotent and never re-adds a hidden or edited default', async () => {
    const repo = memRepo();
    const first = await ensureSystemVisaTypes(repo);
    const tampered = first.map((t, i) => (i === 0 ? { ...t, hidden: true } : i === 1 ? { ...t, name: 'Renamed' } : t));
    const repo2 = memRepo(tampered);
    const second = await ensureSystemVisaTypes(repo2);
    expect(second).toHaveLength(first.length);
    expect(repo2.rows()).toHaveLength(first.length);
  });

  it('adds only the defaults a firm is missing', async () => {
    const first = await seeded();
    const repo = memRepo(first.slice(2));
    const result = await ensureSystemVisaTypes(repo);
    expect(result).toHaveLength(first.length);
  });
});

describe('Not Confirmed handling', () => {
  it('is not a confirmed subclass, and neither is blank', () => {
    expect(isConfirmedSubclass(NOT_CONFIRMED_SUBCLASS)).toBe(false);
    expect(isConfirmedSubclass('')).toBe(false);
    expect(isConfirmedSubclass(undefined)).toBe(false);
    expect(isConfirmedSubclass('189')).toBe(true);
  });

  it('is labelled "Not Confirmed" and is never part of the picker list', async () => {
    const types = await seeded();
    expect(formatSubclass(NOT_CONFIRMED_SUBCLASS, types)).toBe('Not Confirmed');
    expect(subclassOptions(types).some(o => o.code === NOT_CONFIRMED_SUBCLASS)).toBe(false);
  });

  it('has no substreams', async () => {
    expect(substreamsFor(await seeded(), NOT_CONFIRMED_SUBCLASS)).toEqual([]);
  });

  it('cannot be added as a Visa Type', async () => {
    const types = await seeded();
    expect(validateVisaType({ subclass: 'Not Confirmed', name: 'x', substream: '' }, types)).toMatch(/built in/);
    expect(validateVisaType({ subclass: NOT_CONFIRMED_SUBCLASS, name: 'x', substream: '' }, types)).toMatch(/built in/);
  });
});

describe('subclassOptions', () => {
  it('lists each visible subclass once, in shipped order, with display codes', async () => {
    const options = subclassOptions(await seeded());
    expect(options.map(o => o.code)).toEqual(['189', '190', '186', '482', '491', '500', '485', '600', '417', '820']);
    expect(options.find(o => o.code === '820')?.label).toBe('820/801 Partner (Temporary/Residence)');
  });

  it('drops a subclass once all its rows are hidden, but keeps a saved value', async () => {
    const types = (await seeded()).map(t => (t.subclass === '190' ? { ...t, hidden: true } : t));
    expect(subclassOptions(types).some(o => o.code === '190')).toBe(false);
    expect(subclassOptions(types, '190').some(o => o.code === '190')).toBe(true);
  });
});

describe('substream filtering', () => {
  it('lists only the chosen subclass\'s visible substreams', async () => {
    const types = await seeded();
    expect(substreamsFor(types, '189')).toEqual(['Points-tested', 'New Zealand']);
    expect(substreamsFor(types, '190')).toEqual([]);
    const hidden = types.map(t => (t.substream === 'New Zealand' ? { ...t, hidden: true } : t));
    expect(substreamsFor(hidden, '189')).toEqual(['Points-tested']);
    expect(substreamsFor(hidden, '189', 'New Zealand')).toEqual(['Points-tested', 'New Zealand']);
  });

  it('clears the substream when the subclass changes to one that does not offer it', async () => {
    const types = await seeded();
    expect(substreamAfterSubclassChange(types, '186', 'Labour Agreement')).toBe('Labour Agreement');
    expect(substreamAfterSubclassChange(types, '482', 'Labour Agreement')).toBe('Labour Agreement');
    expect(substreamAfterSubclassChange(types, '189', 'Labour Agreement')).toBeUndefined();
    expect(substreamAfterSubclassChange(types, NOT_CONFIRMED_SUBCLASS, 'Labour Agreement')).toBeUndefined();
    expect(substreamAfterSubclassChange(types, '', 'Labour Agreement')).toBeUndefined();
  });
});

describe('edit and reset defaults', () => {
  it('detects an edited default and restores it', async () => {
    const row = (await seeded())[0];
    const edited = { ...row, name: 'Changed', hidden: true };
    expect(isEditedDefault(row)).toBe(false);
    expect(isEditedDefault(edited)).toBe(true);
    const reset = resetVisaType(edited);
    expect(reset.name).toBe(row.name);
    expect(reset.hidden).toBe(true);
    expect(reset.id).toBe(row.id);
  });

  it('rejects duplicates of subclass + substream', async () => {
    const types = await seeded();
    expect(validateVisaType({ subclass: '189', name: 'Skilled Independent', substream: 'points-tested' }, types)).toMatch(/already/);
    expect(validateVisaType({ subclass: '189', name: 'Skilled Independent', substream: 'Regional' }, types)).toBeNull();
  });
});
