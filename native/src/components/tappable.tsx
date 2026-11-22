import { Pressable, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native';
import type { ComponentProps } from 'react';

/** How far a control dims while a finger is on it, the same as the floating tab bar. */
export const PRESSED_OPACITY = 0.8;

type Props = ComponentProps<typeof Pressable>;

/** The style to draw with: the control's own style, dimmed while it is held unless it is disabled. */
export function tappableStyle(style: Props['style'], state: PressableStateCallbackType, disabled?: boolean | null): StyleProp<ViewStyle> {
  const own = typeof style === 'function' ? style(state) : style;
  return state.pressed && !disabled ? [own, { opacity: PRESSED_OPACITY }] : own;
}

/** A Pressable that dims while it is held, so every tap shows it landed. A disabled one never dims.
 * It takes the same props as Pressable, including a style function. */
export function Tappable({ style, ...rest }: Props) {
  return <Pressable {...rest} style={state => tappableStyle(style, state, rest.disabled)} />;
}
