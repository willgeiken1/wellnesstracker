import type { ReactNode } from 'react';
import { ScrollView, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { t } from '@/i18n/en';
import { alpha, KIT, StackGapContext, SurfaceContext, useKit } from './kit-style';
import { KitText } from './themed-text';
import { Tappable } from './tappable';

/** The kit's `.grab`: the 36 x 5 pt handle at the top of a sheet, the text colour at 22 percent. Draw it only where the
 * system does not (a native form sheet with `sheetGrabberVisible` shows its own). */
export function SheetGrabber() {
  const k = useKit();
  return <View accessible={false} importantForAccessibility="no" style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 2.5, marginTop: 5, backgroundColor: alpha(k.c.text, 0.22) }} />;
}

/**
 * The kit's `.sh` (`ui.sheetHead`): a 56 pt bar at the top of a sheet on the sheet's own colour, Cancel on the left,
 * the title in 700 17 pt in the middle and a bold action (Done, Save, Add) on the right, ghosted while disabled.
 * Pass `left={null}` for no left button, or `right` with no handler for a Done that closes the sheet.
 */
export function SheetHeader({ title, left, onLeft, right, onRight, rightDisabled = false, grabber = false, testID }: {
  title?: string; left?: string | null; onLeft?: () => void; right?: string; onRight?: () => void; rightDisabled?: boolean;
  /** Draw the kit's grabber above the bar. */ grabber?: boolean; testID?: string;
}) {
  const k = useKit();
  const close = () => router.back();
  const side = (label: string, onPress: () => void, strong: boolean, disabled = false) => <Tappable dim="text" accessibilityRole="button"
    accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    testID={testID ? `${testID}-${strong ? 'right' : 'left'}` : undefined}
    style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 8, justifyContent: 'center', alignItems: strong ? 'flex-end' : 'flex-start' }}>
    <KitText weight={strong ? 700 : 500} size={17} tracking={-0.01} color={disabled ? 'ghost' : 'accent'}>{label}</KitText>
  </Tappable>;
  return <View testID={testID} style={{ backgroundColor: k.sheetBg, marginHorizontal: -16, marginBottom: 4, zIndex: 5 }}>
    {grabber ? <SheetGrabber /> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 4, paddingHorizontal: 8 }}>
      <View style={{ flex: 1, minWidth: 80, alignItems: 'flex-start' }}>{left === null ? null : side(left ?? t('kitCancel'), onLeft ?? close, false)}</View>
      {title ? <KitText weight={700} size={17} tracking={-0.02} numberOfLines={1} accessibilityRole="header" style={{ textAlign: 'center', flexShrink: 1 }}>{title}</KitText> : null}
      <View style={{ flex: 1, minWidth: 80, alignItems: 'flex-end' }}>{right ? side(right, onRight ?? close, true, rightDisabled) : null}</View>
    </View>
  </View>;
}

/**
 * A sheet's body (`.sheet > .scroll`): the sheet colour (the surface in dark, the page colour in light), 16 pt sides and
 * room at the end for the home indicator. Lists, cards, chips and fields inside take their sheet colours. Put a
 * SheetHeader first; it stays at the top while the rest scrolls.
 */
export function Sheet({ header, children, scroll = true, gap = KIT.gap, testID, ...scrollProps }: Omit<ScrollViewProps, 'children'> & {
  header?: ReactNode; children: ReactNode; scroll?: boolean; /** Space between blocks (cards stack 12 pt apart). */ gap?: number; testID?: string;
}) {
  const k = useKit();
  const insets = useSafeAreaInsets();
  const body = <StackGapContext.Provider value={gap}>{children}</StackGapContext.Provider>;
  return <SurfaceContext.Provider value="sheet">
    <View testID={testID} style={{ flex: 1, backgroundColor: k.sheetBg }}>
      {header ? <View style={{ paddingHorizontal: 16 }}>{header}</View> : null}
      {scroll
        ? <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets {...scrollProps}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 + insets.bottom, gap }}>{body}</ScrollView>
        : <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 40 + insets.bottom, gap }}>{body}</View>}
    </View>
  </SurfaceContext.Provider>;
}
