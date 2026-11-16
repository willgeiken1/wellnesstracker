import { useSyncExternalStore } from 'react';
import type { Row } from '../../data/rows';
import type { Repository } from '../../data/repository';

/** Apple Health weigh-ins, held in memory only. They are read again on each visit and never saved, so they
 * never reach the phone's database, iCloud Backup, sync or an export (App Review 5.1.3(ii)). Kept per account,
 * so a reading never shows under a different owner. */
const byOwner = new Map<string, readonly Row[]>();
const listeners = new Set<() => void>();
const NONE: readonly Row[] = [];
const notify = () => { for (const listener of listeners) listener(); };

export function healthWeighIns(owner: string | undefined): readonly Row[] {
  return (owner && byOwner.get(owner)) || NONE;
}
export function setHealthWeighIns(owner: string, rows: readonly Row[]) {
  if (rows.length) byOwner.set(owner, rows); else byOwner.delete(owner);
  notify();
}
/** Forget every account's readings, as on sign-out. */
export function clearHealthWeighIns() { byOwner.clear(); notify(); }

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** The Apple Health weigh-ins for this repository's account, updating when a read lands. */
export function useHealthWeighIns(repo: Repository | null | undefined): readonly Row[] {
  const owner = repo?.owner;
  return useSyncExternalStore(subscribe, () => healthWeighIns(owner), () => NONE);
}
