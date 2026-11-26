import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { t } from '@/i18n/en';
import { mix, useKit } from './kit-style';

/**
 * The kit's `.bar` (`ui.bar`): an 8 pt track (its colour at 18 percent over surface 2) with a rounded fill that eases to
 * `value` (0 to 1) over half a second. Reduce Motion: it changes without travelling.
 */
export function ProgressBar({ value, color, label, testID }: { value: number; /** Theme token, the accent unless given. */ color?: string; /** Spoken name. */ label?: string; testID?: string }) {
  const k = useKit();
  const c = k.tok(color);
  const f = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const [w] = useState(() => new Animated.Value(f));
  useEffect(() => {
    if (k.reduceMotion) { w.setValue(f); return; }
    const a = Animated.timing(w, { toValue: f, duration: 500, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [f, k.reduceMotion, w]);
  const percent = Math.round(f * 100);
  return <View testID={testID} accessible accessibilityRole="progressbar" accessibilityLabel={label}
    accessibilityValue={{ min: 0, max: 100, now: percent, text: t('kitProgress').replace('{percent}', String(percent)) }}
    style={{ height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: mix(c, k.c['surface-2'], 0.18) }}>
    <Animated.View style={{ height: '100%', borderRadius: 4, backgroundColor: c, width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
  </View>;
}
