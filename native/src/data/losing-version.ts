import type { Row } from './rows';
/** Stored in owner-scoped sync_state only, never the wire catalog/outbox. */
export interface LosingVersion { key: string; row: Row; expiresAt: number }
export const LOSING_VERSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export function losingVersionKey(row: Row) {
  return `losing:${row.table}:${row.id}:${row.updated_at}:${row.device_id}`;
}
