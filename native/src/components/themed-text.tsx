import { Text, type TextProps } from 'react-native';
import { tokens } from '@/design/tokens';
import { useTheme } from '@/design/theme-provider';
import { HEADING_MAX } from './text-size';
/**
 * App text. Grows with the system text size without limit (`maxFontSizeMultiplier` 0), except the display and title
 * headings, which stop at `HEADING_MAX` so a word never breaks in the middle. A caller can set its own cap.
 */
export function ThemedText({ variant = 'body', muted = false, numeric = false, style, maxFontSizeMultiplier, ...props }:
  TextProps & { variant?: keyof typeof tokens.type; muted?: boolean; numeric?: boolean }) {
  const { colors } = useTheme();
  return <Text {...props} allowFontScaling maxFontSizeMultiplier={maxFontSizeMultiplier ?? (variant in HEADING_MAX ? HEADING_MAX[variant as keyof typeof HEADING_MAX] : 0)} style={[
    { color: muted ? colors['text-muted'] : colors.text, fontSize: tokens.type[variant],
      fontFamily: numeric ? tokens.font.numeral : ['display', 'title', 'headline'].includes(variant) ? tokens.font.heading : undefined,
      fontVariant: numeric ? ['tabular-nums'] : undefined }, style,
  ]} />;
}
