import { ScrollView, View, Pressable, StyleSheet, type ColorValue } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { ThemedText } from './themed-text';
import { Icon } from './icon';
import { DOCK_FADE } from './floating-tabs';
export function Screen({ children, title, tabHeader = false, topInset = false }: PropsWithChildren<{ title?: string; tabHeader?: boolean; topInset?: boolean }>) {
  const { colors, barLook } = useTheme();
  // Inside a tab the bottom inset is the floating tab bar. The scroll area runs under the bar, so the content
  // needs that much room at its end or the last rows can never be scrolled clear of it.
  // Over the floating bar's fade too, so a last button such as Progress's "Log weigh-in" rests in the clear.
  const insets = useSafeAreaInsets(), fade = tabHeader && barLook === 'floating' ? DOCK_FADE : 0;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg as ColorValue }} edges={tabHeader ? ['top', 'left', 'right'] : topInset ? ['top', 'left', 'right', 'bottom'] : ['left', 'right', 'bottom']}>
    <ScrollView testID="screen-scroll" contentContainerStyle={[styles.content, tabHeader && { paddingBottom: tokens.spacing[3] + insets.bottom + fade }]}>
      {/* REDESIGN §2.1: the avatar (to Settings) sits at the left of the title row, as it does on Home. */}
      {title && <View style={styles.header}>
        {tabHeader && <Pressable testID="screen-avatar" accessibilityRole="button" accessibilityLabel={t('openSettings')} hitSlop={4}
          onPress={() => router.push('/settings')} style={[styles.avatar, { backgroundColor: colors.surface as ColorValue }]}><Icon name="avatar" size={22} /></Pressable>}
        <ThemedText variant="title" accessibilityRole="header" style={{ flex: 1 }}>{title}</ThemedText>
      </View>}
      {children}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ content: { padding: tokens.spacing[3], gap: tokens.spacing[3], flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] },
  // 40 pt like Home's avatar; hitSlop brings the target to 48.
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' } });
