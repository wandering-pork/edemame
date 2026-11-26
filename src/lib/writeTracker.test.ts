import { describe, expect, it } from 'vitest';
import { canApplyRefetch, createWriteTracker, trackRepositoryWrites } from './writeTracker';

class FakeRepo {
  rows = ['a'];
  async getAll() { return [...this.rows]; }
  async update(row: string) { this.rows.push(row); return row; }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

describe('writeTracker', () => {
  it('counts a write as pending until it settles', async () => {
    const tracker = createWriteTracker();
    const gate = deferred();
    const write = tracker.track(() => gate.promise);
    expect(tracker.pending()).toBe(1);
    gate.resolve();
    await write;
    expect(tracker.pending()).toBe(0);
  });

  it('releases the count when a write fails', async () => {
    const tracker = createWriteTracker();
    await expect(tracker.track(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(tracker.pending()).toBe(0);
  });

  it('releases the count when a write throws synchronously', async () => {
    const tracker = createWriteTracker();
    await expect(tracker.track(() => { throw new Error('sync'); })).rejects.toThrow('sync');
    expect(tracker.pending()).toBe(0);
  });

  it('wraps writes but not reads, and keeps class methods working', async () => {
    const tracker = createWriteTracker();
    const repo = trackRepositoryWrites(new FakeRepo(), tracker);
    await repo.getAll();
    expect(tracker.generation()).toBe(0);
    await expect(repo.update('b')).resolves.toBe('b');
    expect(tracker.generation()).toBe(1);
    await expect(repo.getAll()).resolves.toEqual(['a', 'b']);
  });

  it('blocks a refetch while a write is in flight', () => {
    const tracker = createWriteTracker();
    const gate = deferred();
    const start = tracker.generation();
    void tracker.track(() => gate.promise);
    expect(canApplyRefetch(tracker, start)).toBe(false);
    gate.resolve();
  });

  it('discards a refetch that overlapped a write, even once the write finished', async () => {
    const tracker = createWriteTracker();
    const start = tracker.generation();
    await tracker.track(() => Promise.resolve());
    expect(canApplyRefetch(tracker, start)).toBe(false);
    expect(canApplyRefetch(tracker, tracker.generation())).toBe(true);
  });
});
