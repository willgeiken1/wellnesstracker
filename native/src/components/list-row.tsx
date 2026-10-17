import { Pressable } from 'react-native';
import { ThemedText } from './themed-text';
import { Icon } from './icon';
import { touchTarget } from './button';
import { tokens } from '@/design/tokens';
export function ListRow({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={{ minHeight: touchTarget, padding: tokens.spacing[2], flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] }}>
    <ThemedText style={{ flex: 1 }}>{label}</ThemedText><Icon name="chevron" size={20} />
  </Pressable>;
}
