import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { KitText } from './themed-text';

/**
 * The kit's `.stat` (`ui.stat`): a big 700 28 pt tabular number with a small muted unit, a label under it and an
 * optional second line, such as a change since last week. `color` tints the number, `subColor` the second line
 * (theme tokens: `success` for a gain, `danger` for a loss). The number's line is 1.05 of 28 pt with or without a unit,
 * so stats side by side keep their labels level.
 */
/** The number line's height in pt (`.stat b`: 28 px / 1.05); the unit takes the same, so it never makes the line taller. */
const NUMBER_LINE = 28 * 1.05;

export function Stat({ value, unit, label, sub, color, subColor, style, testID }: {
  value: ReactNode; unit?: string; label?: string; sub?: string; color?: string; subColor?: string; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  return <View testID={testID} style={style} accessible accessibilityLabel={[`${typeof value === 'string' || typeof value === 'number' ? value : ''}${unit ? ' ' + unit : ''}`, label, sub].filter(Boolean).join(', ')}>
    <KitText weight={700} size={28} lineHeight={NUMBER_LINE / 28} tracking={-0.035} numeric color={color ?? 'text'}>
      {value}
      {unit ? <KitText weight={600} size={14} lineHeight={NUMBER_LINE / 14} tracking={0} color="text-muted">{' ' + unit}</KitText> : null}
    </KitText>
    {label ? <KitText weight={600} size={12.5} color="text-muted" style={{ marginTop: 4 }}>{label}</KitText> : null}
    {sub ? <KitText weight={500} size={12.5} color={subColor ?? 'text-muted'} style={{ marginTop: 2 }}>{sub}</KitText> : null}
  </View>;
}
