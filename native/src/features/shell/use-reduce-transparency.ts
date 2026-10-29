import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export function useReduceTransparency() {
  // Stay opaque until the preference is known, including when the query fails.
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let active = true;
    let receivedEvent = false;
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', value => {
      receivedEvent = true;
      setReduced(value);
    });
    AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
      if (active && !receivedEvent) setReduced(value);
    }).catch(() => {});
    return () => { active = false; subscription.remove(); };
  }, []);
  return reduced;
}
