import { ScrollView, StyleSheet, type ColorValue } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { IconButton } from './button';
import { KIT, StackGapContext } from './kit-style';
import { PageHeader } from './nav-bar';
import { DOCK_FADE } from './floating-tabs';
export function Screen({ children, title, tabHeader = false, topInset = false }: PropsWithChildren<{ title?: string; tabHeader?: boolean; topInset?: boolean }>) {
  const { colors, barLook } = useTheme();
  // Inside a tab the bottom inset is the floating tab bar. The scroll area runs under the bar, so the content
  // needs that much room at its end or the last rows can never be scrolled clear of it.
  // Over the floating bar's fade too, so a last button such as Progress's "Log weigh-in" rests in the clear.
  const insets = useSafeAreaInsets(), fade = tabHeader && barLook === 'floating' ? DOCK_FADE : 0;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg as ColorValue }} edges={tabHeader ? ['top', 'left', 'right'] : topInset ? ['top', 'left', 'right', 'bottom'] : ['left', 'right', 'bottom']}>
    {/* Fields stay above the keyboard on iOS, the first tap on a button while the keyboard is up still
        presses it, and dragging the list puts the keyboard away. */}
    <ScrollView testID="screen-scroll" keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets contentContainerStyle={[styles.content, tabHeader && { paddingTop: 0, paddingBottom: tokens.spacing[3] + insets.bottom + fade }]}>
      <StackGapContext.Provider value={KIT.gap}>
        {/* A tab's header sits right under the status bar, as the mockup's page does. */}
        {title && <PageHeader title={title} right={tabHeader ? <IconButton icon="person" label={t('openSettings')} onPress={() => router.push('/settings')} /> : undefined} />}
        {children}
      </StackGapContext.Provider>
    </ScrollView>
  </SafeAreaView>;
}
// The kit's page: a 16 pt gutter, and cards and lists stacked 12 pt apart (`.card + .card`).
const styles = StyleSheet.create({ content: { padding: tokens.spacing[3], gap: KIT.gap, flexGrow: 1 } });
