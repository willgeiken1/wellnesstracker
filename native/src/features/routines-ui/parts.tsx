import type { PropsWithChildren, ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { touchTarget } from '@/components/button';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { Glyph, type GlyphName } from './glyph';

export const semibold = { fontWeight: '600' } as const;
/** The corner of every Routines card. */
export const CARD_RADIUS = 18;
/** A card in Routines: the card colour, radius 18, no shadow, so a long page of them stays calm. */
export function Panel({ children, style, testID }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; testID?: string }>) {
  const { colors } = useTheme();
  return <View testID={testID} style={[{ backgroundColor: colors.surface, borderRadius: CARD_RADIUS, padding: tokens.spacing[2], gap: tokens.spacing[1] }, style]}>{children}</View>;
}

/** A small text button: caption, semibold, with a full-size target. */
export function TextButton({ label, onPress, spoken, color, pill = false, testID, expanded }: {
  label: string; onPress: () => void; spoken?: string; color?: string; pill?: boolean; testID?: string; expanded?: boolean;
}) {
  const { colors } = useTheme();
  return <Tappable testID={testID} accessibilityRole="button" accessibilityLabel={spoken ?? label} accessibilityState={expanded === undefined ? undefined : { expanded }} onPress={onPress}
    style={{ minHeight: touchTarget, minWidth: touchTarget, alignItems: 'center', justifyContent: 'center' }}>
    <View style={pill ? { borderWidth: 1, borderColor: colors['hair-2'], borderRadius: 99, paddingHorizontal: tokens.spacing[2], paddingVertical: tokens.spacing[0] + 2 } : { paddingHorizontal: tokens.spacing[1] }}>
      <ThemedText variant="caption" style={[semibold, { color: color ?? colors['text-muted'], textAlign: 'center' }]}>{label}</ThemedText>
    </View>
  </Tappable>;
}

/** A round icon button with a 44pt target around a smaller disc. */
export function RoundButton({ glyph, label, onPress, disabled = false, testID, size = 32 }: {
  glyph: GlyphName; label: string; onPress: () => void; disabled?: boolean; testID?: string; size?: number;
}) {
  const { colors } = useTheme();
  return <Tappable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ width: touchTarget, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
    <View style={{ width: size, aspectRatio: 1, borderRadius: size / 2, backgroundColor: colors['surface-2'], alignItems: 'center', justifyContent: 'center' }}>
      <Glyph name={glyph} size={Math.round(size * 0.56)} />
    </View>
  </Tappable>;
}

/** The main button of a sheet or a card: full width, round, in the accent. */
export function PrimaryButton({ label, onPress, testID, disabled = false }: { label: string; onPress: () => void; testID?: string; disabled?: boolean }) {
  const { colors } = useTheme();
  return <Tappable dim="fill" testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ minHeight: 52, borderRadius: 26, paddingHorizontal: tokens.spacing[4], paddingVertical: tokens.spacing[2], alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.accent, opacity: disabled ? 0.5 : 1 }}>
    <ThemedText style={[semibold, { color: colors['on-accent'], textAlign: 'center' }]}>{label}</ThemedText>
  </Tappable>;
}

/** The top of a sheet: its title, and a round close button. */
export function SheetHeader({ title, close, onClose }: { title: string; close: string; onClose: () => void }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] }}>
    <ThemedText variant="title" accessibilityRole="header" style={{ flex: 1 }}>{title}</ThemedText>
    <RoundButton glyph="close" label={close} onPress={onClose} testID="sheet-close" />
  </View>;
}

/** A label over a field or a group of choices. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <ThemedText variant="caption" muted style={semibold}>{children}</ThemedText>;
}
/** A line of help or of fine print. */
export function Note({ children, testID }: { children: ReactNode; testID?: string }) {
  return <ThemedText testID={testID} variant="caption" muted>{children}</ThemedText>;
}
