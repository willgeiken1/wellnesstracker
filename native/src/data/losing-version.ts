import type { Row } from './rows';
/** Stored in owner-scoped sync_state only, never the wire catalog/outbox. */
export interface LosingVersion { key: string; row: Row; winningRevision: string; expiresAt: number }
export const MAX_LOSING_VERSIONS = 50;
export const LOSING_VERSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export function losingVersionKey(row: Row) {
  return `losing:${row.table}:${row.id}:${row.updated_at}:${row.device_id}`;
}
