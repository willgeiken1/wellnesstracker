import { useCallback, useSyncExternalStore } from 'react';
import type { Repository } from '../../data/repository';
/** Subscribe without depending on a component's own form state changes. */
export function useFoodRevision(repository:Repository) {
 const subscribe=useCallback((notify:()=>void)=>repository.subscribe(notify),[repository]);
 return useSyncExternalStore(subscribe,repository.getRevision,repository.getRevision);
}
