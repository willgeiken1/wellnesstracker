import { ScrollView, View, StyleSheet, type ColorValue } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PropsWithChildren } from 'react';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { ThemedText } from './themed-text';
export function Screen({ children, title, tabHeader = false, topInset = false }: PropsWithChildren<{ title?: string; tabHeader?: boolean; topInset?: boolean }>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg as ColorValue }} edges={tabHeader ? ['left', 'right'] : topInset ? ['top', 'left', 'right', 'bottom'] : ['left', 'right', 'bottom']}>
    <ScrollView testID="screen-scroll" contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustsScrollIndicatorInsets
      contentContainerStyle={[styles.content, tabHeader && { paddingBottom: tokens.spacing[3] + insets.bottom }]}>
      {title && !tabHeader && <View style={styles.header}>
        <ThemedText variant="title" accessibilityRole="header" style={{ flex: 1 }}>{title}</ThemedText>
      </View>}
      {children}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ content: { padding: tokens.spacing[3], gap: tokens.spacing[3], flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] } });
