import { View } from 'react-native';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { KIT, useKit } from './kit-style';
import { KitText } from './themed-text';

/**
 * The kit's `.empty` (`ui.empty`): a 52 pt tinted icon tile, a 700 17 pt title and a short muted line (at most 270 pt
 * wide), centred, with an optional button 8 pt below. `color` tints the tile (the accent unless given).
 */
export function EmptyState({ title, description, icon = 'info', color, action, testID }: {
  title: string; description?: string; icon?: IconName; color?: string;
  action?: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'quiet' }; testID?: string;
}) {
  const k = useKit();
  const c = k.tok(color);
  return <View testID={testID} style={{ alignItems: 'center', gap: 8, paddingVertical: 28, paddingHorizontal: 16 }}>
    <View style={{ width: 52, height: 52, borderRadius: KIT.radius.empty, alignItems: 'center', justifyContent: 'center', backgroundColor: k.tint(c, 0.14) }}>
      <Icon name={icon} size={26} color={c} />
    </View>
    <KitText weight={700} size={17} tracking={-0.02} accessibilityRole="header" style={{ textAlign: 'center' }}>{title}</KitText>
    {description ? <KitText weight={500} size={14} lineHeight={1.45} color="text-muted" style={{ textAlign: 'center', maxWidth: 270 }}>{description}</KitText> : null}
    {action ? <View style={{ marginTop: 8 }}><Button label={action.label} onPress={action.onPress} variant={action.variant} color={color} /></View> : null}
  </View>;
}
