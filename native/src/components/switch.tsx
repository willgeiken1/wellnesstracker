import { useEffect, useState } from 'react';
import { Animated } from 'react-native';
import { Tappable } from './tappable';
import { springConfig } from './kit-motion';
import { useKit } from './kit-style';
import { useSelectionHaptic } from './selection-haptic';

/**
 * The kit's `.sw` (`ui.toggle`): a 51 x 31 pt switch, the hairline grey when off and the success green when on. The knob
 * springs across on the switch spring and widens while held, as iOS does. Grown to 45 pt tall to touch.
 * Reduce Motion: the knob moves without travelling. `label` is spoken.
 */
export function Switch({ value, onValueChange, label, disabled = false, testID }: {
  value: boolean; onValueChange: (next: boolean) => void; label: string; disabled?: boolean; testID?: string;
}) {
  const k = useKit();
  const haptic = useSelectionHaptic();
  const [x] = useState(() => new Animated.Value(value ? 20 : 0));
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (k.reduceMotion) { x.setValue(value ? 20 : 0); return; }
    const a = Animated.spring(x, springConfig('switch', value ? 20 : 0, false));
    a.start();
    return () => a.stop();
  }, [value, k.reduceMotion, x]);
  // While held the knob grows from 27 to 32 pt toward the middle; on, it stays against the right edge.
  const grow = held && !k.reduceMotion ? 5 : 0;
  return <Tappable dim="none" testID={testID} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value, disabled }}
    disabled={disabled} hitSlop={{ top: 7, bottom: 7 }} onPressIn={() => setHeld(true)} onPressOut={() => setHeld(false)}
    onPress={() => { haptic(); onValueChange(!value); }}
    style={{ width: 51, height: 31, borderRadius: 16, backgroundColor: value ? k.c.success : k.c['hair-2'], opacity: disabled ? 0.4 : 1 }}>
    <Animated.View style={{ position: 'absolute', top: 2, left: 2, height: 27, width: 27 + grow, borderRadius: 14, backgroundColor: '#FFFFFF',
      boxShadow: '0px 3px 7px rgba(0, 0, 0, 0.16), 0px 1px 1px rgba(0, 0, 0, 0.12)',
      transform: [{ translateX: value ? Animated.subtract(x, grow) : x }] }} />
  </Tappable>;
}
