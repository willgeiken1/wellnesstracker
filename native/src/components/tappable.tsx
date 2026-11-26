import { Pressable, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native';
import type { ComponentProps } from 'react';

/** How far a row, an icon or a text-only target dims while a finger is on it. */
export const PRESSED_ROW_OPACITY = 0.6;
/** How far a filled button, chip, tile or key dims while a finger is on it. A fill already shows its edge, so it needs less. */
export const PRESSED_FILL_OPACITY = 0.75;
/** How far a text button in a nav bar, sheet header, section header or toast dims while held (kit.css: .45, at once). */
export const PRESSED_TEXT_OPACITY = 0.45;
/** How far a choice in a segmented control that is not chosen dims while held (kit.css: .5). */
export const PRESSED_SEG_OPACITY = 0.5;
/** How far a row inside a tile dims while held, such as a workout or a record in a list tile (the page tiles' rows: .7). */
export const PRESSED_TILE_ROW_OPACITY = 0.7;

/** Which dim a control takes: `row` for rows and text-only targets, `fill` for filled buttons and keys,
 * `text` for the kit's accent text buttons, `seg` for a segment not chosen, `tile` for a row inside a tile,
 * `none` for one that shows its press another way or has nothing to do on a tap. */
export type Dim = 'row' | 'fill' | 'text' | 'seg' | 'tile' | 'none';
const DIMS = { row: PRESSED_ROW_OPACITY, fill: PRESSED_FILL_OPACITY, text: PRESSED_TEXT_OPACITY, seg: PRESSED_SEG_OPACITY, tile: PRESSED_TILE_ROW_OPACITY } as const;

type Props = ComponentProps<typeof Pressable> & { dim?: Dim };

/** The style to draw with: the control's own style, dimmed while it is held unless it is disabled. */
export function tappableStyle(style: Props['style'], state: PressableStateCallbackType, disabled?: boolean | null, dim: Dim = 'row'): StyleProp<ViewStyle> {
  const own = typeof style === 'function' ? style(state) : style;
  return state.pressed && !disabled && dim !== 'none' ? [own, { opacity: DIMS[dim] }] : own;
}

/** A Pressable that dims while it is held, so every tap shows it landed. A disabled one never dims.
 * It takes the same props as Pressable, including a style function, and `dim` to pick how far it dims. */
export function Tappable({ style, dim, ...rest }: Props) {
  return <Pressable {...rest} style={state => tappableStyle(style, state, rest.disabled, dim)} />;
}
