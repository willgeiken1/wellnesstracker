import type { MessageKey } from '@/i18n/en';
import type { SyncStatus } from './engine';

/** Where sync stands, as one of the app's sync lines. Only a finished sync with nothing waiting reads as up to date. */
export interface SyncState { status: SyncStatus; pending: number; conflicts: number }
export function syncLineKey({ status, pending, conflicts }: SyncState): MessageKey {
  return status === 'syncing' ? 'syncBusy' : status === 'offline' ? 'syncOffline' : status === 'attention' ? 'syncAttention'
    : pending > 0 ? 'syncPending' : conflicts > 0 ? 'syncConflictStatus' : 'syncIdle';
}
/** Whether a sync left everything sent and nothing to review. */
export const syncedClean = (s: SyncState) => syncLineKey(s) === 'syncIdle';
