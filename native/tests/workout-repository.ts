import type { Repository } from "../src/data/repository";
import type { Row } from "../src/data/rows";
export function memoryRepository() {
  const rows: Row[] = [],
    local = new Map<string, unknown>();
  let sequence = 0,
    revision = 0;
  const listeners = new Set<() => void>();
  const notify = () => {
    revision++;
    listeners.forEach((f) => f());
  };
  return {
    owner: "demo",
    getRevision: () => revision,
    subscribe: (f: () => void) => {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    list: (table: string) =>
      rows.filter((r) => r.table === table && r.deleted_at === null),
    get: (table: string, id: string) =>
      rows.find((r) => r.table === table && r.id === id),
    atomic: (f: () => unknown) => f(),
    localGet: (key: string) => local.get(key),
    localSnapshot: () => Object.fromEntries(local),
    localSave: (key: string, value: unknown) => {
      local.set(key, value);
      notify();
    },
    save: (table: Row["table"], data: Row["data"], id = String(++sequence)) => {
      let row = rows.find((r) => r.table === table && r.id === id);
      if (row) {
        row.data = data;
        row.deleted_at = null;
      } else {
        row = {
          id,
          table,
          data,
          deleted_at: null,
          updated_at: Date.now(),
          owner_id: "demo",
          device_id: "synthetic",
        };
        rows.push(row);
      }
      notify();
      return row;
    },
    remove: (table: string, id: string) => {
      const row = rows.find((r) => r.table === table && r.id === id);
      if (row) row.deleted_at = Date.now();
      notify();
    },
  } as unknown as Repository;
}
