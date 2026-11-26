// Cloud mode re-downloads cases/tasks/deadlines when the window regains focus (App.tsx's
// refetch-on-focus) and replaces what's on screen with the result. App.tsx updates state first
// and saves second, so a refetch that runs while a save is still in progress can bring back the
// old row and silently undo the edit the person just made. This tracks in-flight writes on the
// repositories the refetch replaces, so the refetch can skip a round, or throw away a stale
// result, instead of overwriting newer local state.

export interface WriteTracker {
  /** Number of writes currently in flight. */
  pending(): number;
  /** Bumps every time a write starts. A refetch compares it before/after to spot a write it overlapped. */
  generation(): number;
  /** Wraps one write; the returned promise is the write's own. */
  track<T>(write: () => Promise<T>): Promise<T>;
}

export function createWriteTracker(): WriteTracker {
  let pending = 0;
  let generation = 0;
  return {
    pending: () => pending,
    generation: () => generation,
    track<T>(write: () => Promise<T>): Promise<T> {
      pending++;
      generation++;
      let result: Promise<T>;
      try {
        result = Promise.resolve(write());
      } catch (err) {
        pending--;
        return Promise.reject(err);
      }
      return result.finally(() => {
        pending--;
      });
    },
  };
}

/**
 * Wraps a repository so every method that isn't a read (name starting with `get`) goes through the
 * tracker. A Proxy rather than a spread copy, since cloud repositories are class instances whose
 * methods live on the prototype.
 */
export function trackRepositoryWrites<R extends object>(repo: R, tracker: WriteTracker): R {
  return new Proxy(repo, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      if (typeof prop === 'string' && prop.startsWith('get')) return value.bind(target);
      return (...args: unknown[]) => tracker.track(() => value.apply(target, args));
    },
  });
}

/**
 * Whether a refetch that started at `startGeneration` may apply its result: no write is still in
 * flight, and none started while it was fetching.
 */
export function canApplyRefetch(tracker: WriteTracker, startGeneration: number): boolean {
  return tracker.pending() === 0 && tracker.generation() === startGeneration;
}
