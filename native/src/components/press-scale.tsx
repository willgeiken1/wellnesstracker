import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { usePressScale } from './kit-motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A control with the mockup's `.press` feel: it dips to 97 percent and dims a little while held, then springs back.
 * Reduce Motion keeps only the dim. Takes Pressable's props; `style` is a plain style (no function).
 */
export function PressScale({ style, onPressIn, onPressOut, disabled, ...rest }: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> }) {
  const press = usePressScale(!!disabled);
  return <AnimatedPressable {...rest} disabled={disabled}
    onPressIn={e => { press.handlers.onPressIn(); onPressIn?.(e); }}
    onPressOut={e => { press.handlers.onPressOut(); onPressOut?.(e); }}
    style={[press.style, style]} />;
}
