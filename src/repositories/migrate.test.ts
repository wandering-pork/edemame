import { describe, it, expect, vi } from 'vitest';
import { clearAll } from './migrate';
import type { Repositories } from './types';

describe('clearAll', () => {
  it('deletes nothing when the destination refuses to be cleared', async () => {
    const getAllCases = vi.fn().mockResolvedValue([]);
    const dest = {
      assertSafeToClear: vi.fn().mockRejectedValue(new Error('shared firm')),
      cases: { getAll: getAllCases },
    } as unknown as Repositories;

    await expect(clearAll(dest)).rejects.toThrow('shared firm');
    expect(getAllCases).not.toHaveBeenCalled();
  });

  it('checks the guard before reading anything', async () => {
    const order: string[] = [];
    const dest = {
      assertSafeToClear: vi.fn(async () => { order.push('guard'); throw new Error('stop'); }),
      cases: { getAll: vi.fn(async () => { order.push('cases'); return []; }) },
    } as unknown as Repositories;

    await expect(clearAll(dest)).rejects.toThrow('stop');
    expect(order).toEqual(['guard']);
  });
});
