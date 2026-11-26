import type { ReactNode } from 'react';
import { randomUUID } from 'node:crypto';
import { ThemeProvider } from '../src/design/theme-provider';
import type { Repository } from '../src/data/repository';
import type { Row } from '../src/data/rows';
import { routineDayKey } from '../src/features/routines/model/dose';
import type { RoutineStore } from '../src/features/routines/model/shape';
import type { RoutineClock } from '../src/features/routines/model/write';
import { commitRoutineStore, readRoutineStore, seedDefaultRoutines } from '../src/features/routines/data/sqlite';

/* Shared by the Routines sheet tests. Everything here is synthetic: made-up names, no real routine of anyone's. */

/** A phone database in memory. A save stamps the row with the time it is given, as the real one does. */
export function sheetRepository(): Repository {
  const rows: Row[] = [];
  let revision = 0;
  const listeners = new Set<() => void>();
  const notify = () => { revision += 1; listeners.forEach((listener) => listener()); };
  const find = (table: string, id: string) => rows.find((row) => row.table === table && row.id === id);
  return {
    owner: 'demo', device: 'synthetic',
    getRevision: () => revision,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    list: (table: string) => rows.filter((row) => row.table === table && row.deleted_at === null),
    get: find,
    atomic: (work: () => unknown) => work(),
    localGet: () => undefined,
    putLocal: (row: Row) => { rows.push({ ...row }); notify(); },
    save: (table: Row['table'], data: Row['data'], id: string = randomUUID(), now = Date.now()) => {
      let row = find(table, id);
      if (row) { row.data = data; row.deleted_at = null; row.updated_at = now; }
      else { row = { id, table, data, deleted_at: null, updated_at: now, owner_id: 'demo', device_id: 'synthetic' } as Row; rows.push(row); }
      notify();
      return row;
    },
    remove: (table: string, id: string, now = Date.now()) => {
      const row = find(table, id);
      if (row) { row.deleted_at = now; row.updated_at = now; row.data = {} as Row['data']; }
      notify();
    },
  } as unknown as Repository;
}

export const clockNow = (): RoutineClock => ({ now: Date.now(), day: routineDayKey(new Date(), 4) });

/** A database with the two default routines, Morning and Night. */
export function seededRepository(): Repository {
  const repo = sheetRepository();
  seedDefaultRoutines(repo);
  return repo;
}

/** Changes the stored routines with one of the app's own rules, and returns what the rule returned. */
export function change<T extends { store: RoutineStore } | RoutineStore | null>(repo: Repository, rule: (store: RoutineStore, clock: RoutineClock, newId: () => string) => T): T {
  const result = rule(readRoutineStore(repo), clockNow(), randomUUID);
  if (!result) throw new Error('The rule refused the change.');
  commitRoutineStore(repo, 'store' in result ? result.store : result);
  return result;
}

export const stored = (repo: Repository) => readRoutineStore(repo);

export const wrapper = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

/** Every string a rendered tree shows or reads out, joined, for checks on what a screen never says. */
export function everyWord(node: unknown): string {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (value == null || typeof value === 'boolean') return;
    if (typeof value === 'string' || typeof value === 'number') { out.push(String(value)); return; }
    if (Array.isArray(value)) { value.forEach(walk); return; }
    const element = value as { props?: Record<string, unknown>; children?: unknown };
    if (element.props) {
      for (const key of ['accessibilityLabel', 'accessibilityHint', 'placeholder', 'value']) if (typeof element.props[key] === 'string') out.push(element.props[key] as string);
    }
    walk(element.children);
  };
  walk(node);
  return out.join('\n');
}
