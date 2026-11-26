import { Text, type TextProps } from 'react-native';
import { tokens } from '@/design/tokens';
import { useTheme } from '@/design/theme-provider';
import { font, tabular, useKit, type Weight } from './kit-style';
export function ThemedText({ variant = 'body', muted = false, numeric = false, style, ...props }:
  TextProps & { variant?: keyof typeof tokens.type; muted?: boolean; numeric?: boolean }) {
  const { colors } = useTheme();
  return <Text {...props} allowFontScaling maxFontSizeMultiplier={0} style={[
    { color: muted ? colors['text-muted'] : colors.text, fontSize: tokens.type[variant],
      fontFamily: numeric ? tokens.font.numeral : ['display', 'title', 'headline'].includes(variant) ? tokens.font.heading : tokens.font.body,
      fontVariant: numeric ? ['tabular-nums'] : undefined }, style,
  ]} />;
}

/**
 * Text in one of the kit's exact styles: `weight` 500, 600 or 700, `size` in pt (never under 11), the mockup's
 * `lineHeight` as a multiple and `tracking` in em. `color` is a theme token name (`text-muted`, `accent`) or a colour.
 * Numbers set `numeric` for tabular figures.
 */
export function KitText({ weight = 500, size = 15, lineHeight, tracking, color = 'text', numeric = false, style, ...props }:
  TextProps & { weight?: Weight; size?: number; lineHeight?: number; tracking?: number; color?: string; numeric?: boolean }) {
  const { tok } = useKit();
  return <Text {...props} allowFontScaling maxFontSizeMultiplier={0}
    style={[font(weight, size, lineHeight, tracking), { color: tok(color) }, numeric && tabular, style]} />;
}

/**
 * An exact gap inside a line of text, where the design sets a margin between a number and its unit
 * (`small { margin-left: 3px }`). A space of the body face is 0.173 em wide; tracking makes up the rest.
 */
export function TextGap({ pt, size = 11 }: { pt: number; size?: number }) {
  return <Text style={{ fontFamily: tokens.font.body, fontSize: size, letterSpacing: Math.round((pt - 0.173 * size) * 100) / 100 }}>{' '}</Text>;
}
