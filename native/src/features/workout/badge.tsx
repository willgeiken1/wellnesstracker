import { useEffect, useState } from 'react';
import { ThemedText } from '@/components/themed-text';
import { t } from '@/i18n/en';
export function SyncBadge({
  local,
  pending,
  status
}: {
  local: boolean;
  pending: number;
  status: 'idle' | 'syncing' | 'offline';
}) {
  const busy = pending > 0 || status !== 'idle';
  const [transition, setTransition] = useState({
    busy,
    local,
    synced: false
  });
  // A prop transition derives the brief acknowledgement without an effect cascade.
  if (transition.busy !== busy || transition.local !== local) setTransition({
    busy,
    local,
    synced: !local && !busy && transition.busy
  });
  useEffect(() => {
    if (!transition.synced) return;
    const timer = setTimeout(() => setTransition(value => ({
      ...value,
      synced: false
    })), 1500);
    return () => clearTimeout(timer);
  }, [transition.synced]);
  const label = local ? t('savedPhone') : status === 'offline' ? t('offlineSaved') : busy ? t('pendingSaved') : transition.synced ? t('synced') : null;
  return label ? <ThemedText accessibilityLiveRegion="polite" muted variant="caption">{label}</ThemedText> : null;
}
