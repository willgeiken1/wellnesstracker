import type { ReactNode } from 'react';
import { ScrollView, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from './icon';
import { useKit } from './kit-style';
import { KitText } from './themed-text';
import { PressScale } from './press-scale';

/**
 * The kit's `.chip` (`ui.chip`): a 36 pt pill in 600 13.5 pt type, grown to 48 pt to touch. Chosen, it fills with
 * `color` (the accent unless given) and on-accent text. On a dark sheet it sits a step up so it still reads as a control.
 */
export function Chip({ label, selected = false, onPress, icon, color, testID, accessibilityLabel }: {
  label: string; selected?: boolean; onPress: () => void; icon?: IconName; color?: string; testID?: string; accessibilityLabel?: string;
}) {
  const k = useKit();
  const ink = selected ? k.c['on-accent'] : k.c.text;
  return <PressScale testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected }}
    onPress={onPress} hitSlop={{ top: 6, bottom: 6 }}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: 999, flexShrink: 0,
      backgroundColor: selected ? k.tok(color) : k.controlBg, boxShadow: selected ? undefined : k.cardEdge }}>
    {icon ? <Icon name={icon} size={15} color={ink} /> : null}
    <KitText weight={600} size={13.5} color={ink}>{label}</KitText>
  </PressScale>;
}

/** The kit's `.chips`: a row of chips with 8 pt gaps that scrolls sideways edge to edge past the 16 pt gutter. */
export function Chips({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} testID={testID} style={[{ marginHorizontal: -16, marginVertical: -6, flexGrow: 0 }, style]}
    contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 6 }}>{/* 6 pt above and below keep each chip's grown touch area inside the scroll view without moving it. */}{children}</ScrollView>;
}
