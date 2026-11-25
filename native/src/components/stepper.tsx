import { View } from 'react-native';
import { t } from '@/i18n/en';
import { Icon } from './icon';
import { mix, useKit } from './kit-style';
import { KitText } from './themed-text';
import { Tappable } from './tappable';
import { useSelectionHaptic } from './selection-haptic';

export type StepOptions = { step?: number; min?: number; max?: number; dec?: number; snap?: boolean };

/** The mockup's number format (`INS.fmt`): thousands separators, `dec` decimal places. */
export function formatNumber(value: number, dec = 0): string {
  if (!Number.isFinite(value)) return String(value);
  const [whole, frac] = (dec ? value.toFixed(dec) : String(Math.round(value))).split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? '.' + frac : '');
}

/**
 * The value one press of the stepper gives, as the mockup works it out: `snap` lands on the step's grid
 * (9,200 then 9,250 and 9,500, not 9,450), the result stays within `min` and `max`, and is rounded to `dec` places.
 */
export function stepValue(current: number, direction: -1 | 1, { step = 1, min = 0, max = 1e9, dec = 0, snap = false }: StepOptions = {}): number {
  const down = direction < 0;
  const next = snap
    ? (down ? Math.ceil(current / step - 1e-9) * step - step : Math.floor(current / step + 1e-9) * step + step)
    : current + (down ? -step : step);
  return Number(Math.min(max, Math.max(min, next)).toFixed(dec));
}

/**
 * The kit's `.stepper` (`ui.stepper`): minus and plus in 38 pt circles either side of the value in 700 17 pt tabular
 * figures, on a surface-2 pill. In a card or list on a dark sheet, which is surface 2 itself, the pill steps up 8 percent
 * toward the text colour so it still reads. Each button grows to 44 pt to touch. VoiceOver reads it as one adjustable control too.
 */
export function Stepper({ value, onChange, unit, label, testID, ...opts }: StepOptions & {
  value: number; onChange: (next: number) => void; unit?: string; /** Spoken name of the value. */ label?: string; testID?: string;
}) {
  const k = useKit();
  const haptic = useSelectionHaptic();
  const text = formatNumber(value, opts.dec ?? 0) + (unit ? ' ' + unit : '');
  const go = (d: -1 | 1) => { const v = stepValue(value, d, opts); if (v !== value) haptic(); onChange(v); };
  const button = (d: -1 | 1) => <Tappable dim="none" accessibilityRole="button" accessibilityLabel={d < 0 ? t('kitLess') : t('kitMore')}
    testID={testID ? `${testID}-${d < 0 ? 'less' : 'more'}` : undefined} onPress={() => go(d)} hitSlop={{ top: 4, bottom: 4, left: 3, right: 3 }}
    style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? k.c['hair-2'] : 'transparent' })}>
    <Icon name={d < 0 ? 'minus' : 'plus'} size={18} color={k.c.text} />
  </Tappable>;
  return <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, padding: 3, borderRadius: 999,
    backgroundColor: k.dark && k.surface === 'sheet-inset' ? mix(k.c.text, k.c['surface-2'], 0.08) : k.c['surface-2'] }}>
    {button(-1)}
    <View accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={e => go(e.nativeEvent.actionName === 'increment' ? 1 : -1)} style={{ minWidth: 64 }}>
      <KitText weight={700} size={17} tracking={-0.015} numeric style={{ textAlign: 'center' }}>{text}</KitText>
    </View>
    {button(1)}
  </View>;
}
