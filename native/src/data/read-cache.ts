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
