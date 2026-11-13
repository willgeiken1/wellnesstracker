import { Text, type TextProps } from 'react-native';
import { tokens } from '@/design/tokens';
import { useTheme } from '@/design/theme-provider';
/** App text. Grows with the system text size without limit (`maxFontSizeMultiplier` 0) unless a caller caps it on purpose. */
export function ThemedText({ variant = 'body', muted = false, numeric = false, style, maxFontSizeMultiplier = 0, ...props }:
  TextProps & { variant?: keyof typeof tokens.type; muted?: boolean; numeric?: boolean }) {
  const { colors } = useTheme();
  return <Text {...props} allowFontScaling maxFontSizeMultiplier={maxFontSizeMultiplier} style={[
    { color: muted ? colors['text-muted'] : colors.text, fontSize: tokens.type[variant],
      fontFamily: numeric ? tokens.font.numeral : ['display', 'title', 'headline'].includes(variant) ? tokens.font.heading : undefined,
      fontVariant: numeric ? ['tabular-nums'] : undefined }, style,
  ]} />;
}
