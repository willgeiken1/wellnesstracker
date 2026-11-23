import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { useSelectionHaptic } from '@/components/selection-haptic';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { rs } from '@/i18n/en';
import { routineClock24 } from '@/features/routines/model/types';
import {
  ARC, WINDOW_ARC, arcHolds, arcMinutesAt, arcPoint, arcSegmentPath, arcSegments, dragWindow, handleAt, nearArc, sidewaysDrag,
  type ArcShape, type ArcWindow,
} from './add-item-arc';

const two = (value: number) => String(value).padStart(2, '0');

/**
 * The frame both pickers share: the drawing, the words in the middle, and a
 * sideways drag on a handle. A drag starts only on a handle and only
 * sideways, so a drag up or down still scrolls the sheet or pulls it down.
 */
function ArcFrame({ shape, handles, onDrag, onTap, big, sub, children, overlay }: {
  shape: ArcShape; handles: readonly (number | null)[]; onDrag: (handle: number, minutes: number) => void; onTap?: (minutes: number) => void;
  big: string; sub: string; children: ReactNode; overlay?: (scale: number) => ReactNode;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(shape.width);
  const node = useRef<ComponentRef<typeof View>>(null);
  const touch = useRef({ x: 0, y: 0, left: 0, handle: -1 });
  const scale = width / shape.width;
  const measure = () => node.current?.measureInWindow((left: number) => { if (typeof left === 'number') touch.current.left = left; });
  const begin = (event: GestureResponderEvent) => {
    touch.current.x = event.nativeEvent.pageX;
    touch.current.y = event.nativeEvent.pageY;
    measure();
  };
  const wants = (event: GestureResponderEvent) => {
    const at = touch.current;
    if (!sidewaysDrag(event.nativeEvent.pageX - at.x, event.nativeEvent.pageY - at.y)) return false;
    at.handle = handleAt((at.x - at.left) / scale, handles, shape, 28 / scale);
    return at.handle >= 0;
  };
  const move = (event: GestureResponderEvent) => {
    const minutes = arcMinutesAt((event.nativeEvent.pageX - touch.current.left) / scale, shape, shape === ARC ? 5 : 15);
    if (minutes != null && touch.current.handle >= 0) onDrag(touch.current.handle, minutes);
  };
  const tap = (event: GestureResponderEvent) => {
    if (!onTap) return;
    const x = event.nativeEvent.locationX / scale, y = event.nativeEvent.locationY / scale;
    const minutes = arcMinutesAt(x, shape, 5);
    if (minutes != null && nearArc(x, y, shape, 24 / scale)) onTap(minutes);
  };
  return <View ref={node} onLayout={(event) => { setWidth(event.nativeEvent.layout.width || shape.width); measure(); }}
    onTouchStart={begin} onMoveShouldSetResponder={wants} onResponderGrant={() => true} onResponderMove={move} onResponderTerminationRequest={() => false}>
    <Pressable testID="arc-surface" accessible={false} onPress={tap} disabled={!onTap}>
      <Svg width="100%" viewBox={`0 0 ${shape.width} ${shape.height}`} style={{ aspectRatio: shape.width / shape.height }} accessible={false}>{children}</Svg>
    </Pressable>
    <View pointerEvents="none" style={{ position: 'absolute', left: '16%', right: '16%', top: `${Math.round(((shape.hy - shape.ry * 0.62) / shape.height) * 100)}%`, alignItems: 'center' }}>
      {/* These two lines grow with Dynamic Type only as far as the space inside the path allows. */}
      <Text testID="arc-big" numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.3}
        style={{ color: colors.text, fontSize: tokens.type.title, fontFamily: tokens.font.numeral, fontVariant: ['tabular-nums'], fontWeight: '600', textAlign: 'center' }}>{big}</Text>
      <Text testID="arc-sub" numberOfLines={2} maxFontSizeMultiplier={1.3}
        style={{ color: colors['text-muted'], fontSize: tokens.type.caption, fontWeight: '600', textAlign: 'center' }}>{sub}</Text>
    </View>
    {overlay?.(scale)}
  </View>;
}

function Backdrop({ shape, hours }: { shape: ArcShape; hours: readonly number[] }) {
  const { colors } = useTheme();
  return <>
    <Path d={arcSegmentPath(shape.startMin, shape.endMin, shape)} fill="none" stroke={colors['hair-2']} strokeWidth={2} strokeDasharray="1 6" strokeLinecap="round" />
    <Line x1={shape.x0 - 10} y1={shape.hy} x2={shape.x1 + 10} y2={shape.hy} stroke={colors['text-muted']} strokeWidth={1.3} />
    {hours.map((hour) => (
      <SvgText key={hour} x={arcPoint(hour * 60, shape)[0]} y={shape.hy + 16} fontSize={tokens.type.caption} fontFamily={tokens.font.numeral} fill={colors['text-muted']} textAnchor="middle">{two(hour)}</SvgText>
    ))}
  </>;
}

export interface ArcRoutineStroke { id: string; color: string; window: ArcWindow | null }

/**
 * The time picker in Add item. Each routine draws its window on the path;
 * the ones the item sits in draw thick. A tap on the path drops a pin for
 * the item's own time, and the pin drags sideways in 5 minute steps.
 * VoiceOver reads it as one adjustable control; the Time row below does the same job.
 */
export function TimeArc({ routines, picked, timeMin, valueText, big, sub, onTime, onStep }: {
  routines: readonly ArcRoutineStroke[]; picked: ReadonlySet<string>; timeMin: number | null; valueText: string; big: string; sub: string;
  onTime: (minutes: number) => void; onStep: (step: number) => void;
}) {
  const { colors } = useTheme();
  const tick = useSelectionHaptic();
  const pinned = arcHolds(timeMin) ? timeMin : null;
  const set = (minutes: number) => { if (minutes !== timeMin) { tick(); onTime(minutes); } };
  const pin = pinned == null ? null : arcPoint(pinned);
  return <View testID="item-arc" accessible accessibilityRole="adjustable" accessibilityLabel={rs('time')} accessibilityHint={rs('arcHint')} accessibilityValue={{ text: valueText }}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    onAccessibilityAction={(event) => onStep(event.nativeEvent.actionName === 'increment' ? 5 : -5)}>
    <ArcFrame shape={ARC} handles={[pinned]} onDrag={(_, minutes) => set(minutes)} onTap={set} big={big} sub={sub}>
      <Backdrop shape={ARC} hours={[5, 11, 17, 23]} />
      {routines.flatMap((routine) => arcSegments(routine.window).map(([from, to], part) => (
        <Path key={`${routine.id}-${part}`} testID={`arc-seg-${routine.id}`} d={arcSegmentPath(from, to)} fill="none" stroke={routine.color}
          strokeWidth={picked.has(routine.id) ? 9 : 4} strokeLinecap="round" />
      )))}
      {pin && <>
        <Line x1={pin[0]} y1={ARC.hy} x2={pin[0]} y2={pin[1]} stroke={colors.text} strokeWidth={1.4} strokeDasharray="2 3" />
        <Circle testID="arc-pin" cx={pin[0]} cy={pin[1]} r={8} fill={colors.surface} stroke={colors.text} strokeWidth={3} />
      </>}
    </ArcFrame>
  </View>;
}

/**
 * The window picker in New routine: one stroke from the start to the end,
 * with a handle on each. Each handle drags sideways in 15 minute steps and
 * is an adjustable control for VoiceOver. The two time fields under it do
 * the same job without the path.
 */
export function WindowArc({ window, color, onWindow, onStep }: {
  window: ArcWindow; color: string; onWindow: (next: ArcWindow) => void; onStep: (end: 0 | 1, step: number) => void;
}) {
  const { colors } = useTheme();
  const tick = useSelectionHaptic();
  const shape = WINDOW_ARC;
  const startAt = Math.max(shape.startMin, Math.min(shape.endMin, window.startMin));
  const endAt = Math.max(shape.startMin, Math.min(shape.endMin, window.endMin));
  const drag = (handle: number, minutes: number) => {
    const next = dragWindow(window, handle === 0 ? 0 : 1, minutes);
    if (next.startMin !== window.startMin || next.endMin !== window.endMin) { tick(); onWindow(next); }
  };
  const ends = [{ key: 'start', label: rs('startTime'), minutes: window.startMin, at: arcPoint(startAt, shape) }, { key: 'end', label: rs('endTime'), minutes: window.endMin, at: arcPoint(endAt, shape) }];
  return <View testID="window-arc">
    <ArcFrame shape={shape} handles={[startAt, endAt]} onDrag={drag} big={`${routineClock24(window.startMin)}–${routineClock24(window.endMin)}`} sub={rs('dragEnds')}
      overlay={(scale) => ends.map((end, index) => (
        <View key={end.key} testID={`window-arc-${end.key}`} accessible accessibilityRole="adjustable" accessibilityLabel={end.label} accessibilityValue={{ text: routineClock24(end.minutes) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => onStep(index === 0 ? 0 : 1, event.nativeEvent.actionName === 'increment' ? 15 : -15)}
          style={{ position: 'absolute', width: 44, height: 44, left: end.at[0] * scale - 22, top: end.at[1] * scale - 22 }} />
      ))}>
      <Backdrop shape={shape} hours={[5, 11, 17, 23]} />
      {arcSegments(window, shape).map(([from, to], part) => (
        <Path key={part} d={arcSegmentPath(from, to, shape)} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" />
      ))}
      {ends.map((end) => <Circle key={end.key} cx={end.at[0]} cy={end.at[1]} r={11} fill={colors.surface} stroke={colors.text} strokeWidth={3} />)}
    </ArcFrame>
  </View>;
}
