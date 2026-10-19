import * as SecureStore from 'expo-secure-store';

const key='insight.last-signed-in-owner.v1';
export function realOwnerId(value: unknown): string | null {
  return typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value) ? value : null;
}
// Serialize auth writes with departure clears so an earlier write cannot outlive a wipe.
let pending: Promise<unknown>=Promise.resolve();
function ordered<T>(operation:()=>Promise<T>):Promise<T> {
  const flight=pending.then(operation);
  pending=flight.catch(()=>{});
  return flight;
}
/** Non-secret export scope only: one user id, outside SQLite and session storage. */
export const lastOwnerStorage={
  read:()=>ordered(async()=>realOwnerId(await SecureStore.getItemAsync(key))),
  write:(owner:unknown)=>ordered(async()=>{
    const id=realOwnerId(owner);
    if(id)await SecureStore.setItemAsync(key,id,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
    else await SecureStore.deleteItemAsync(key);
  }),
  clear:()=>ordered(()=>SecureStore.deleteItemAsync(key)),
};
