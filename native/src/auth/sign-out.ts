import type { Repository } from '../data/repository';
export interface SignOutMarker { owner: string; startedAt: number; phase: 'pending' | 'wiped' | 'session-cleared' }
export interface SignOutStorage {
  read(): Promise<SignOutMarker | null>; write(marker: SignOutMarker): Promise<void>; remove(): Promise<void>;
}
export interface OwnerDatabase { forOwner(owner: string): Repository }
export async function beginSignOut(owner: string, storage: SignOutStorage, startedAt=Date.now()): Promise<SignOutMarker> {
  const existing=await storage.read();
  if(existing) {
    if(existing.owner!==owner)throw new Error('Sign-out recovery required.');
    return existing;
  }
  const marker:SignOutMarker={owner,startedAt,phase:'pending'};
  await storage.write(marker);
  return marker;
}
/** Checkpoints follow each completed step. A crash before a checkpoint safely repeats that step. */
export async function completeSignOut(marker: SignOutMarker, repo: Repository, storage: SignOutStorage, clearSession:(owner:string)=>Promise<void>) {
  if(repo.owner!==marker.owner)throw new Error('Sign-out owner mismatch.');
  if(marker.phase==='pending') {
    repo.wipe(); // All owner data and sync metadata in one SQLite transaction.
    marker={...marker,phase:'wiped'};await storage.write(marker);
  }
  if(marker.phase==='wiped') {
    await clearSession(marker.owner);
    marker={...marker,phase:'session-cleared'};await storage.write(marker);
  }
  await storage.remove();
}
export class DepartureFailure extends Error { constructor(){super('Sign-out recovery required.');} }
export class CorruptSignOutMarker extends Error { constructor(){super('Sign-out recovery unavailable.');} }
export class UnreadableSignOutMarker extends Error {
  constructor(){super('Sign-out recovery unavailable.');}
}
/** No checkpoints: a retained corrupt/unreadable marker repeats all steps safely. */
export async function escapeSignOut(database: {wipeAll():void}, storage: SignOutStorage, clearSession:()=>Promise<void>) {
  database.wipeAll();
  await clearSession();
  await storage.remove();
}
// StrictMode/multiple boot consumers must not clear credentials after another consumer starts auth.
const recoveries=new WeakMap<SignOutStorage,Promise<string|null>>();
export function recoverSignOut(database: OwnerDatabase, storage: SignOutStorage, clearSession:(owner:string)=>Promise<void>): Promise<string|null> {
  const existing=recoveries.get(storage);if(existing)return existing;
  const flight=(async()=>{
    let marker:SignOutMarker|null;
    try {marker=await storage.read();} catch(error) {if(error instanceof CorruptSignOutMarker)throw error;throw new UnreadableSignOutMarker();}
    if(!marker)return null;
    await completeSignOut(marker,database.forOwner(marker.owner),storage,clearSession);
    return marker.owner;
  })().finally(()=>{recoveries.delete(storage);});
  recoveries.set(storage,flight);return flight;
}
