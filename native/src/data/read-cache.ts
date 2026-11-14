/**
 * A read-only view of a repository that asks the database for each list or value once.
 *
 * Screens that only read (Home, the Insight Score) call the same few lists hundreds of times while they work
 * out a day: every "sets of this exercise" is a fresh query for the whole table. On a phone that made Home
 * take seconds once there were two weeks of history. This view remembers each answer for as long as it lives.
 *
 * Make one per repository revision and throw it away after: it never sees later writes, so it must not be
 * used to save anything or kept across a change.
 */
const READS = new Set(['list', 'get', 'localGet']);
export function cachedReads<T extends object>(repo: T): T {
  const seen = new Map<string, unknown>();
  return new Proxy(repo, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown;
      if (typeof value !== 'function') return value;
      const call = value as (...args: unknown[]) => unknown;
      if (typeof prop !== 'string' || !READS.has(prop)) return call.bind(target);
      return (...args: unknown[]) => {
        const key = `${prop}:${JSON.stringify(args)}`;
        if (!seen.has(key)) seen.set(key, call.apply(target, args));
        const answer = seen.get(key);
        // Callers sort and filter what they are given; each gets its own copy of the list.
        return Array.isArray(answer) ? [...answer] : answer;
      };
    },
  });
}

/** Calls that only look. Anything else might write, so it empties what {@link liveReads} remembers. */
const LOOKS = new Set([
  ...READS, 'getRevision', 'subscribe', 'pending', 'conflicts', 'unsyncedCount', 'hasUnsynced', 'cursor',
  'syncTables', 'localSnapshot', 'canPromotePreferences',
]);
type Revisioned = { getRevision(): number };

/**
 * The same remembering as {@link cachedReads}, but safe for a store that also saves.
 *
 * History, a past workout and the charts ask for the same whole lists inside nested loops, which is thousands
 * of database reads per draw once there are weeks of training. This view answers each list or value once and
 * forgets everything the moment something could have changed: when the repository's revision moves (any
 * committed change, from any writer), and around every call made through it that is not a plain read (so a
 * save inside an open atomic block, where the revision has not moved yet, is seen at once, and so is a block
 * that was rolled back).
 */
export function liveReads<T extends Revisioned>(repo: T): T {
  const seen = new Map<string, unknown>();
  let revision = repo.getRevision();
  return new Proxy(repo, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown;
      if (typeof value !== 'function') return value;
      const call = value as (...args: unknown[]) => unknown;
      if (typeof prop !== 'string' || !LOOKS.has(prop)) {
        return (...args: unknown[]) => {
          seen.clear();
          try { return call.apply(target, args); } finally { seen.clear(); }
        };
      }
      if (!READS.has(prop)) return call.bind(target);
      return (...args: unknown[]) => {
        const now = target.getRevision();
        if (now !== revision) { seen.clear(); revision = now; }
        const key = `${prop}:${JSON.stringify(args)}`;
        if (!seen.has(key)) seen.set(key, call.apply(target, args));
        const answer = seen.get(key);
        return Array.isArray(answer) ? [...answer] : answer;
      };
    },
  });
}

const shared = new WeakMap<object, unknown>();
/**
 * The one {@link liveReads} view for a repository. Every screen that reads the same repository shares it, so a
 * year of history is decoded once per change instead of once per mounted screen. Passing a view back in returns
 * that view, so wrapping twice never stacks two caches.
 */
export function sharedReads<T extends Revisioned & object>(repo: T): T {
  const known = shared.get(repo) as T | undefined;
  if (known) return known;
  const view = liveReads(repo);
  shared.set(repo, view);
  shared.set(view, view);
  return view;
}
