import { useState, type ReactElement, type ReactNode } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
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
 * at all (every sheet showed its header over a blank body: Log food, Water, a split preset, and the tile tray still
 * opened black after the content's own height only took over once the screen measured collapsed), because the content
 * fills its screen with `flex: 1`. So on iOS the content always takes the sheet's own height: a sheet with one fixed
 * detent is `detent` of the large sheet, which stands `LARGE_TOP` below the status bar, and never changes height.
 * Elsewhere the outer view keeps measuring what the screen gives, and the content takes that height only while the
 * screen gives none.
 */
export function SheetFrame({ detent, children, ios = Platform.OS === 'ios' }: { detent: number; children: ReactNode; ios?: boolean }) {
  const insets = useSafeAreaInsets(), { height } = useWindowDimensions();
  const [collapsed, setCollapsed] = useState(false);
  const own = Math.round((height - insets.top - LARGE_TOP) * detent);
  if (ios) return <View testID="sheet-frame" style={{ height: own }}><ScrollFinderStop />{children}</View>;
  return <View style={{ flex: 1 }} onLayout={e => setCollapsed(e.nativeEvent.layout.height < COLLAPSED)}>
    <View testID="sheet-frame" style={collapsed ? { height: own } : { flex: 1 }}>{children}</View>
  </View>;
}

/**
 * An empty first child that ends react-native-screens' search for a sheet's scroll view. On iOS a form sheet follows
 * each first child down from its screen, and the first scroll view it meets is moved to the screen's own frame, origin
 * and all, unless that scroll view sits directly in the screen's content. A sheet whose body is a scroll view (Add a
 * tile, Edit tile, a page section, the rest timer) sits inside this frame, so its scroll view was moved down by the
 * sheet's height and the sheet showed only its black background. A one-height sheet has no use for that search (it is
 * for dragging a sheet between heights), so it stops here: this view has no children and is never flattened away.
 */
function ScrollFinderStop() {
  return <View testID="sheet-scroll-stop" collapsable={false} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
    style={{ position: 'absolute', width: 0, height: 0 }} />;
}

/** A stack's `screenLayout`: fixed-height sheets get the frame, every other screen is left as it is. */
export function sheetScreenLayout({ options, children }: { options: NativeStackNavigationOptions; children: ReactElement }) {
  const detent = sheetDetent(options);
  return detent == null ? children : <SheetFrame detent={detent}>{children}</SheetFrame>;
}
