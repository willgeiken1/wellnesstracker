import { useState, type ReactElement, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationOptions } from 'expo-router';

/** Under this, the height a sheet's screen gives its content can only mean none: a sheet's header alone is about
 * 70 pt and the shortest sheet here is about 215 pt. */
export const COLLAPSED = 120;
/** A large sheet's top edge below the status bar on iOS (the system's large detent). */
export const LARGE_TOP = 10;

/** The one fixed height a sheet rests at, as a share of the large sheet; null for anything that isn't such a sheet. */
export function sheetDetent(options: NativeStackNavigationOptions | undefined): number | null {
  if (options?.presentation !== 'formSheet') return null;
  const d = options.sheetAllowedDetents;
  if (d == null) return 1;
  // fitToContents takes its height from its content, so it has none to fall back to.
  if (!Array.isArray(d)) return null;
  if (!d.length) return 1;
  const top = d[d.length - 1];
  return typeof top === 'number' && top > 0 ? Math.min(1, top) : null;
}

/**
 * The frame every fixed-height sheet's content sits in. On iOS a form sheet's screen can hand its content no height
 * at all (every sheet showed its header over a blank body: Log food, Water, a split preset), because the content
 * fills its screen with `flex: 1`. The outer view keeps measuring what the screen gives; while that is collapsed,
 * the content takes the sheet's own height from the window instead, and goes back to filling once the screen has one.
 */
export function SheetFrame({ detent, children }: { detent: number; children: ReactNode }) {
  const insets = useSafeAreaInsets(), { height } = useWindowDimensions();
  const [collapsed, setCollapsed] = useState(false);
  const own = Math.round((height - insets.top - LARGE_TOP) * detent);
  return <View style={{ flex: 1 }} onLayout={e => setCollapsed(e.nativeEvent.layout.height < COLLAPSED)}>
    <View testID="sheet-frame" style={collapsed ? { height: own } : { flex: 1 }}>{children}</View>
  </View>;
}

/** A stack's `screenLayout`: fixed-height sheets get the frame, every other screen is left as it is. */
export function sheetScreenLayout({ options, children }: { options: NativeStackNavigationOptions; children: ReactElement }) {
  const detent = sheetDetent(options);
  return detent == null ? children : <SheetFrame detent={detent}>{children}</SheetFrame>;
}
