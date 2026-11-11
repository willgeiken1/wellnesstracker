import { ScrollView, View, Pressable, StyleSheet, type ColorValue } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { ThemedText } from './themed-text';
import { Icon } from './icon';
import { touchTarget } from './button';
export function Screen({ children, title, tabHeader = false, topInset = false }: PropsWithChildren<{ title?: string; tabHeader?: boolean; topInset?: boolean }>) {
  const { colors } = useTheme();
  // Inside a tab the bottom inset is the floating tab bar. The scroll area runs under the bar, so the content
  // needs that much room at its end or the last rows can never be scrolled clear of it.
  const insets = useSafeAreaInsets();
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg as ColorValue }} edges={tabHeader ? ['top', 'left', 'right'] : topInset ? ['top', 'left', 'right', 'bottom'] : ['left', 'right', 'bottom']}>
    <ScrollView testID="screen-scroll" contentContainerStyle={[styles.content, tabHeader && { paddingBottom: tokens.spacing[3] + insets.bottom }]}>
      {title && <View style={styles.header}>
        <ThemedText variant="title" accessibilityRole="header" style={{ flex: 1 }}>{title}</ThemedText>
        {tabHeader && <Pressable accessibilityRole="button" accessibilityLabel={t('openSettings')}
          onPress={() => router.push('/settings')} style={styles.avatar}><Icon name="avatar" /></Pressable>}
      </View>}
      {children}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ content: { padding: tokens.spacing[3], gap: tokens.spacing[3], flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] },
  avatar: { minWidth: touchTarget, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' } });
