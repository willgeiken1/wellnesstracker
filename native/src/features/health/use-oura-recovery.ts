import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { lastDays } from './days';
import { oura } from './oura-client';
import { readOuraRecovery, type OuraRecovery, type OuraSource } from './oura';

/** Oura's part of Progress › Insights › Recovery for the last `count` days, read whenever the screen comes to the front and when
 * the app is reopened, and again once a refresh from Oura lands. Null when Oura is not connected or cannot be read:
 * the Apple Health part then shows on its own. Kept in memory for this screen only. */
export function useOuraRecovery(focused = true, injected?: OuraSource | null, count = 7): OuraRecovery | null {
  const source = useMemo(() => injected !== undefined ? injected : oura(), [injected]);
  const [read, setRead] = useState<{ source: OuraSource; value: OuraRecovery | null } | null>(null);
  useEffect(() => {
    if (!source || !focused) return;
    // Only the newest read may land: a slow earlier one must not overwrite it.
    let latest = 0, live = true;
    const load = () => {
      const mine = ++latest, current = () => live && mine === latest, now = new Date();
      readOuraRecovery(source, lastDays(now, count), now, () => { if (live) load(); })
        .then(value => { if (current()) setRead({ source, value }); })
        .catch(() => { if (current()) setRead({ source, value: null }); });
    };
    load();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') load(); });
    return () => { live = false; sub?.remove(); };
  }, [source, focused, count]);
  return source && read?.source === source ? read.value : null;
}
