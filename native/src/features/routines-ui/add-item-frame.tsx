import { useCallback, useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, Alert, BackHandler, ScrollView, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { rs } from '@/i18n/en';
import { Glyph } from './add-item-glyphs';

const PAGE = tokens.spacing[3];

/**
 * Closing a sheet. While there are unsaved changes the swipe down is off and
 * Close asks first, so a draft is never lost to a stray swipe. `leave` closes
 * without asking, for after a save.
 */
export function useSheetClose(dirty: boolean) {
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !dirty });
  }, [navigation, dirty]);
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);
  const close = useCallback(() => {
    if (!dirty) { leave(); return; }
    Alert.alert(rs('discardTitle'), undefined, [
      { text: rs('discardKeep'), style: 'cancel' },
      { text: rs('discard'), style: 'destructive', onPress: leave },
    ]);
  }, [dirty, leave]);
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!dirty) return false;
      close();
      return true;
    });
    return () => back.remove();
  }, [dirty, close]);
  return { close, leave };
}

/** Says a short result out loud for VoiceOver. It carries the app's own words only, never what the user typed. */
export function announce(message: string) {
  AccessibilityInfo.announceForAccessibility(message);
}

/**
 * The page a sheet draws on: the title with a round close button, then a
 * scrolling column that keeps the focused field above the keyboard. Dragging
 * the column puts the keyboard away, and the first tap on a button while the
 * keyboard is up still presses it.
 */
export function SheetFrame({ testID, title, onClose, back, toast, children }: {
  testID: string; title: string; onClose: () => void; back?: { label: string; onPress: () => void }; toast?: string | null; children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg, paddingLeft: insets.left, paddingRight: insets.right }}>
    <View style={{ paddingHorizontal: PAGE, paddingTop: Math.max(insets.top, PAGE), paddingBottom: tokens.spacing[1], gap: tokens.spacing[0] }}>
      {back && <Tappable testID={`${testID}-back`} accessibilityRole="button" accessibilityLabel={back.label} onPress={back.onPress} hitSlop={{ top: 6, bottom: 6, right: 12 }}
        style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: 32, gap: 2, marginLeft: -6 }}>
        <Glyph name="back" size={20} color={colors.accent} weight={2.2} />
        <ThemedText style={{ color: colors.accent, fontWeight: '600' }}>{back.label}</ThemedText>
      </Tappable>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] }}>
        <ThemedText variant="title" accessibilityRole="header" style={{ flex: 1, fontWeight: '600' }}>{title}</ThemedText>
        <Tappable testID={`${testID}-close`} accessibilityRole="button" accessibilityLabel={rs('close')} onPress={onClose} hitSlop={6}
          style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors['surface-2'] }}>
          <Glyph name="close" size={16} color={colors['text-muted']} weight={2.4} />
        </Tappable>
      </View>
    </View>
    <ScrollView testID={`${testID}-scroll`} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: PAGE, paddingTop: tokens.spacing[2], paddingBottom: PAGE + insets.bottom, gap: tokens.spacing[4] }}>
      {children}
    </ScrollView>
    {!!toast && <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + tokens.spacing[5], alignItems: 'center' }}>
      <View testID={`${testID}-toast`} accessibilityRole="alert" accessibilityLiveRegion="polite"
        style={{ backgroundColor: colors.text, borderRadius: 999, paddingHorizontal: tokens.spacing[3], paddingVertical: tokens.spacing[2] }}>
        <ThemedText style={{ color: colors.bg, fontWeight: '600' }}>{toast}</ThemedText>
      </View>
    </View>}
  </View>;
}

/** A sheet that cannot draw: the phone's data is not open. */
export function SheetUnavailable({ testID, title, onClose }: { testID: string; title: string; onClose: () => void }) {
  return <SheetFrame testID={testID} title={title} onClose={onClose}>
    <View style={{ gap: tokens.spacing[1] }}>
      <ThemedText variant="headline" style={{ fontWeight: '600' }}>{rs('unavailable')}</ThemedText>
      <ThemedText muted>{rs('unavailableBody')}</ThemedText>
    </View>
  </SheetFrame>;
}

/** A group of fields under a small sentence-case label. */
export function Block({ label, aside, children }: { label: string; aside?: string; children: ReactNode }) {
  return <View style={{ gap: tokens.spacing[1] }}>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: tokens.spacing[1] }}>
      <ThemedText variant="caption" accessibilityRole="header" muted style={{ fontSize: tokens.type.caption, fontWeight: '600' }}>{label}</ThemedText>
      {!!aside && <ThemedText variant="caption" muted>{aside}</ThemedText>}
    </View>
    {children}
  </View>;
}

export function Help({ children }: { children: string }) {
  return <ThemedText variant="caption" muted>{children}</ThemedText>;
}

/** What is missing, said under the button that was pressed. */
export function ErrorLine({ testID, children }: { testID: string; children: string }) {
  const { colors } = useTheme();
  return <ThemedText testID={testID} accessibilityRole="alert" accessibilityLiveRegion="assertive" variant="caption" style={{ color: colors.danger, fontWeight: '600', textAlign: 'center' }}>{children}</ThemedText>;
}

/** The one main action of a sheet: full width, 52 high, fully round. */
export function PrimaryButton({ testID, label, onPress, disabled = false }: { testID: string; label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return <Tappable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tokens.spacing[4], paddingVertical: tokens.spacing[2], backgroundColor: colors.accent, opacity: disabled ? 0.45 : 1 }}>
    <ThemedText style={{ color: colors['on-accent'], fontWeight: '600', textAlign: 'center' }}>{label}</ThemedText>
  </Tappable>;
}

/** A second action: outlined, the same shape as the main one. */
export function OutlineButton({ testID, label, onPress, tone = 'text' }: { testID: string; label: string; onPress: () => void; tone?: 'text' | 'danger' | 'muted' }) {
  const { colors } = useTheme();
  const ink = tone === 'danger' ? colors.danger : tone === 'muted' ? colors['text-muted'] : colors.text;
  return <Tappable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={{ minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tokens.spacing[4], paddingVertical: tokens.spacing[2], borderWidth: tone === 'muted' ? 0 : 1.5, borderColor: colors['hair-2'] }}>
    <ThemedText style={{ color: ink, fontWeight: '600', textAlign: 'center' }}>{label}</ThemedText>
  </Tappable>;
}
