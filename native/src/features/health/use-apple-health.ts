import { useEffect, useMemo, useRef, useState } from 'react';
import type { Repository } from '../../data/repository';
import { appleHealth } from './apple';
import type { HealthAccess, HealthSource } from './source';
import { refreshWeights } from './weights';

export type AppleHealthState = { access: HealthAccess; busy: boolean; added: number | null; failed: boolean; connect: () => void };

/** Connects Apple Health and brings body weight in. Reading starts only after the person taps Connect once;
 * after that each visit quietly picks up new readings. */
export function useAppleHealth(repo: Repository | null | undefined, injected?: HealthSource | null): AppleHealthState {
  const source = useMemo(() => injected !== undefined ? injected : appleHealth(), [injected]);
  const [access, setAccess] = useState<HealthAccess>(source ? 'ask' : 'unavailable');
  const [busy, setBusy] = useState(false), [added, setAdded] = useState<number | null>(null), [failed, setFailed] = useState(false);
  // A quiet look on arrival: it never prompts, and reads only once the person has already been asked.
  useEffect(() => {
    if (!source || !repo) return;
    let live = true;
    (async () => {
      const now = await source.access();
      if (live) setAccess(now);
      const count = now === 'asked' ? await refreshWeights(repo, source, new Date(), () => live) : 0;
      if (live && count) setAdded(count);
    })().catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [source, repo]);
  // Which repository is on screen now. A read that finishes after the page closes or the account changes
  // must not write into it.
  const current = useRef<Repository | null>(null);
  useEffect(() => { current.current = repo ?? null; return () => { current.current = null; }; }, [repo]);
  const connect = () => {
    if (busy || !source || !repo) return;
    setBusy(true); setFailed(false);
    (async () => {
      await source.request();
      const live = () => current.current === repo;
      const now = await source.access();
      if (!live()) return;
      setAccess(now);
      if (now === 'asked') { const count = await refreshWeights(repo, source, new Date(), live); if (live()) setAdded(count); }
    })().catch(() => { if (current.current === repo) setFailed(true); }).finally(() => { if (current.current === repo) setBusy(false); });
  };
  return { access: source && repo ? access : 'unavailable', busy, added, failed, connect };
}
