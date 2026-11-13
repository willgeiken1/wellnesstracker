import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';

/**
 * The two surfaces (REDESIGN 1.2). `Panel` is the everyday block: the surface colour, no border and no shadow.
 * `Card` is the raised one, kept for the body map and the Insight Score on Home: a soft shadow on iOS, and the
 * stronger surface tone on Android. With the "Raised" surface look every panel is drawn as a card, as before.
 * Both take their corner radius from the corner look. Blocks drawn with the prototype's larger corners pass
 * `borderRadius: PROTOTYPE_RADIUS`; that follows the corner look too, as `radius.panel`.
 */
export const PROTOTYPE_RADIUS = 18;
const corners = (style: ViewProps['style'], panel: number) => StyleSheet.flatten(style)?.borderRadius === PROTOTYPE_RADIUS ? { borderRadius: panel } : null;
export function Card({ style, ...props }: ViewProps) {
  const { colors, radius } = useTheme();
  return <View {...props} style={[{ backgroundColor: Platform.OS === 'android' ? colors['surface-2'] : colors.surface,
    padding: tokens.spacing[3], borderRadius: radius.card, gap: tokens.spacing[2] },
    Platform.OS === 'ios' && tokens.elevation.ios, style, corners(style, radius.panel)]} />;
}

export function Panel({ style, ...props }: ViewProps) {
  const { colors, surfaceLook, radius } = useTheme();
  if (surfaceLook === 'raised') return <Card {...props} style={style} />;
  return <View {...props} style={[{ backgroundColor: colors.surface, padding: tokens.spacing[3], borderRadius: radius.card, gap: tokens.spacing[2] }, style, corners(style, radius.panel)]} />;
}
