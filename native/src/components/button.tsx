import type { ReactNode } from 'react';
import { ActivityIndicator, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '@/design/tokens';
import { Icon, type IconName } from './icon';
import { useKit } from './kit-style';
import { KitText } from './themed-text';
import { PressScale } from './press-scale';

export const touchTarget = Platform.OS === 'ios' ? tokens.touch.ios : tokens.touch.android;

/**
 * The mockup's kinds of `.btn`. `primary` is filled; `secondary` (also `tinted`) is a 16 percent tint of its colour;
 * `plain` (also `ghost`) is text only; `quiet` is a neutral fill; `destructive` (also `danger`) is a danger tint.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'tinted' | 'plain' | 'ghost' | 'quiet' | 'destructive' | 'danger';

/** Mirrors `.btn` (`ui.btn`): a 48 pt pill (36 pt with `size="sm"`, grown to 48 pt to touch) in 700 16 pt type. */
export function Button({ label, onPress, variant = 'primary', size = 'md', full = false, color, icon, selected, disabled = false, busy = false,
  testID, accessibilityLabel, accessibilityHint, style }: {
  label: string; onPress: () => void; variant?: ButtonVariant; size?: 'md' | 'sm';
  /** Stretch to the width of the parent (`.btn.full`). */ full?: boolean;
  /** A theme colour token for the fill or tint (`--c`), the accent unless given. */ color?: string;
  icon?: IconName; selected?: boolean; disabled?: boolean; busy?: boolean;
  testID?: string; accessibilityLabel?: string; accessibilityHint?: string; style?: StyleProp<ViewStyle>;
}) {
  const k = useKit();
  const c = k.tok(color);
  const kind = variant === 'tinted' ? 'secondary' : variant === 'ghost' ? 'plain' : variant === 'danger' ? 'destructive' : variant;
  const { bg, ink } = {
    primary: { bg: c, ink: k.c['on-accent'] },
    secondary: { bg: k.tint(c, 0.16), ink: c },
    plain: { bg: 'transparent', ink: c },
    quiet: { bg: k.dark ? k.c['surface-2'] : k.fill, ink: k.c.text },
    destructive: { bg: k.tint(k.c.danger, 0.16), ink: k.c.danger },
  }[kind];
  const sm = size === 'sm';
  return <PressScale testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={accessibilityHint}
    accessibilityState={{ disabled, busy, ...(selected === undefined ? {} : { selected }) }} disabled={disabled || busy} onPress={onPress}
    hitSlop={sm ? { top: 6, bottom: 6 } : undefined}
    style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: sm ? 36 : 48, minWidth: touchTarget,
      paddingHorizontal: sm ? 14 : 20, borderRadius: 999, backgroundColor: bg, ...(full ? { alignSelf: 'stretch' as const } : {}) },
    disabled && { opacity: 0.4 }, style]}>
    {busy ? <ActivityIndicator accessibilityRole="progressbar" color={ink} /> : icon ? <Icon name={icon} size={18} color={ink} /> : null}
    <KitText weight={700} size={sm ? 14 : 16} tracking={-0.01} color={ink} style={{ textAlign: 'center' }}>{label}</KitText>
  </PressScale>;
}

/** The kit's `.iconbtn`: a 40 pt round surface with a 20 pt icon, grown to 44 pt to touch. `label` is spoken. */
export function IconButton({ icon, label, onPress, testID, color }: { icon: IconName; label: string; onPress: () => void; testID?: string; color?: string }) {
  const k = useKit();
  return <PressScale testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={2}
    style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: k.c.surface,
      boxShadow: k.dark ? undefined : `0px 0px 0px 1px ${k.c.hair}` }}>
    <Icon name={icon} size={20} color={color ? k.tok(color) : k.c.text} />
  </PressScale>;
}

/** Buttons side by side or stacked with the kit's 8 pt gap. */
export function ButtonRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, style]}>{children}</View>;
}
