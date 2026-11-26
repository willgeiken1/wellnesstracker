import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/design/theme-provider';
import { alpha } from './kit-style';

/** Whether Reduce Transparency is on in iOS, kept up to date while the app runs. Off where the system has no such setting. */
export function useReduceTransparency(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.().then(v => { if (live) setOn(!!v); }, () => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', v => setOn(!!v));
    return () => { live = false; sub?.remove?.(); };
  }, []);
  return on;
}

/** A CSS blur radius in pt as an expo-blur intensity on iOS: the system blur at full strength is about 30 pt. */
export const blurIntensity = (radius: number) => Math.max(1, Math.min(100, Math.round(radius / 0.3)));

/**
 * The see-through backdrop of a bar or pill (`background: color-mix(in srgb, <color> 88%, transparent);
 * backdrop-filter: blur(18px) saturate(1.4)`): what scrolls under it shows faintly through a blur and the tint.
 * It fills its parent, so put it first inside the bar. With Reduce Transparency on, or where the system can't blur
 * (Android), it is the solid colour, or the tint without the blur.
 */
export function BarBackdrop({ color, amount = 0.88, blur = 18, saturate = 1.4, style }: {
  /** The tint's colour, usually the page colour. */ color: string;
  /** How much of the tint covers the blur, 0 to 1 (the design's color-mix percentage). */ amount?: number;
  /** The blur radius in pt. */ blur?: number;
  /** The saturation boost, as the design's `saturate()`. Web only; iOS's material has its own. */ saturate?: number;
  style?: ViewStyle;
}) {
  const reduce = useReduceTransparency(), { mode } = useTheme();
  const fill = [StyleSheet.absoluteFill, style];
  if (reduce) return <View pointerEvents="none" testID="bar-backdrop-solid" style={[fill, { backgroundColor: color }]} />;
  if (Platform.OS === 'web') {
    const filter = `blur(${blur}px) saturate(${saturate})`;
    return <View pointerEvents="none" testID="bar-backdrop" style={[fill, { backgroundColor: alpha(color, amount), backdropFilter: filter, WebkitBackdropFilter: filter } as ViewStyle]} />;
  }
  if (Platform.OS !== 'ios') return <View pointerEvents="none" testID="bar-backdrop" style={[fill, { backgroundColor: alpha(color, amount) }]} />;
  return <View pointerEvents="none" testID="bar-backdrop" style={[fill, { overflow: 'hidden' }]}>
    <BlurView intensity={blurIntensity(blur)} tint={mode === 'dark' ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'} style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(color, amount) }]} />
  </View>;
}

/** The height a top bar is drawn at before it is measured: the status bar, the 44 pt bar and its 6 pt below. */
export function useTopBarEstimate(extra = 0) { return useSafeAreaInsets().top + 50 + extra; }

/**
 * A screen whose bar floats over its scroll, as the design's sticky `.nb` does: the list runs under the bar and shows
 * through its backdrop. `children` gets the bar's measured height, for the scroll's top padding and indicator inset.
 * The bar sits in the page's 16 pt margin, as the kit's NavBar expects (it reaches out by 16 pt to the edges).
 */
export function UnderBar({ bar, children, gutter = 16, estimate, onTop }: {
  bar: ReactNode; children: (top: number) => ReactNode;
  /** The bar's side padding: 16 for the kit's NavBar, 0 for a bar that spans the screen itself. */ gutter?: number;
  /** The bar's height before it is measured. */ estimate?: number;
  /** Told the bar's height each time it is measured, for code that scrolls to a row. */ onTop?: (top: number) => void;
}) {
  const guess = useTopBarEstimate();
  const [top, setTop] = useState(estimate ?? guess);
  return <View style={{ flex: 1 }}>
    {children(top)}
    <View pointerEvents="box-none" onLayout={e => { const h = Math.round(e.nativeEvent.layout.height); if (h > 0) { onTop?.(h); if (h !== top) setTop(h); } }}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: gutter, zIndex: 5 }}>{bar}</View>
  </View>;
}
