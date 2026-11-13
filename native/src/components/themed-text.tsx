import { Text, type TextProps } from 'react-native';
import { tokens } from '@/design/tokens';
import { useTheme } from '@/design/theme-provider';
export function ThemedText({ variant = 'body', muted = false, numeric = false, style, ...props }:
  TextProps & { variant?: keyof typeof tokens.type; muted?: boolean; numeric?: boolean }) {
  const { colors, headingFont } = useTheme();
  return <Text {...props} allowFontScaling maxFontSizeMultiplier={props.maxFontSizeMultiplier ?? 0} style={[
    { color: muted ? colors['text-muted'] : colors.text, fontSize: tokens.type[variant],
      fontFamily: numeric ? tokens.font.numeral : ['display', 'title', 'headline'].includes(variant) ? headingFont : undefined,
      fontVariant: numeric ? ['tabular-nums'] : undefined }, style,
  ]} />;
}
