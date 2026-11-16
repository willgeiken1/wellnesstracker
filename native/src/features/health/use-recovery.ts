import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { appleHealth } from './apple';
import { lastDays } from './days';
import { readRecovery, type Recovery } from './recovery';
import type { HealthAccess, HealthSource } from './source';

export type RecoveryRead = { access: HealthAccess; recovery: Recovery | null };

/** Recovery for the last `count` days, read fresh from Apple Health whenever the screen comes to the front and when
 * the app is reopened. Kept in memory for this screen only. `unavailable` where Apple Health cannot exist. */
export function useRecovery(focused = true, injected?: HealthSource | null, count = 7): RecoveryRead {
  const source = useMemo(() => injected !== undefined ? injected : appleHealth(), [injected]);
  const [read, setRead] = useState<{ source: HealthSource; value: RecoveryRead } | null>(null);
  useEffect(() => {
    if (!source || !focused) return;
    // Only the newest read may land: a slow earlier one must not overwrite it.
    let latest = 0, live = true;
    const load = () => {
      const mine = ++latest, current = () => live && mine === latest, now = new Date();
      (async () => {
        const access = await source.access();
        const recovery = access === 'asked' ? await readRecovery(source, lastDays(now, count), now) : null;
        if (current()) setRead({ source, value: { access, recovery } });
      })().catch(() => { if (current()) setRead({ source, value: { access: 'asked', recovery: null } }); });
    };
    load();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') load(); });
    return () => { live = false; sub?.remove(); };
  }, [source, focused, count]);
  if (!source) return { access: 'unavailable', recovery: null };
  return read && read.source === source ? read.value : { access: 'ask', recovery: null };
}
