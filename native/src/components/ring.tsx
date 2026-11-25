import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { mix, useKit } from './kit-style';

/**
 * The kit's `ui.ring`: a progress ring `size` pt across with a `stroke` pt line, filled clockwise from 12 o'clock with
 * round ends; its track is the colour at 18 percent over surface 2. `children` sit in the middle. `label` is spoken.
 * (The app's Day score and Food rings use RingArc, which adds the ring looks from Appearance.)
 */
export function Ring({ value, size = 64, stroke = 7, color, track, label, children, testID }: {
  value: number; size?: number; stroke?: number; color?: string; track?: string; label?: string; children?: ReactNode; testID?: string;
}) {
  const k = useKit();
  const c = k.tok(color);
  const f = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  return <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={label ?? `${Math.round(f * 100)}%`} style={{ width: size, height: size, flexShrink: 0 }}>
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track ? k.tok(track) : mix(c, k.c['surface-2'], 0.18)} strokeWidth={stroke} />
      {/* Drawn even at 0, as the mockup does: the round end then shows as a dot at 12 o'clock. */}
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(circ * f).toFixed(1)} ${circ.toFixed(1)}`} />
    </Svg>
    {children != null && <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>{children}</View>}
  </View>;
}
