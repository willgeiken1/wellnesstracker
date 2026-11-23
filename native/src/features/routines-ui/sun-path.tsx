import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { useSweep } from '@/components/use-sweep';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { routineClock24 } from '@/features/routines/model/types';
import { routinesText } from '@/i18n/en';
import { slotColor } from './colors';
import { DAY_BOX, sunGeometry, type SunDay } from './sun-model';

/** Past this text size the clock and the count no longer fit inside the dome, so they sit above the drawing. */
export const SUN_TEXT_INSIDE = 1.3;
const SUN = 8.5, RAY_FROM = 12, PIN = 3.4;
const semibold = { fontWeight: '600' } as const;

/** What the path says in words: the hours it spans, the time, what is left, each routine's count and what comes next. */
export function sunPathLabel(day: SunDay, nowMin: number, caption: string, next: string): string {
  const parts = [routinesText('sunLabel', { start: routineClock24(day.axis.start % 1440), end: routineClock24(day.axis.end % 1440 || 1440), now: routineClock24(nowMin), caption })];
  for (const row of day.legend) parts.push(routinesText('legendSpoken', row));
  if (next) parts.push(`${next}.`);
  return parts.join(' ');
}

/** The caption under the clock: how many are left, that all are done, or that nothing is planned. */
export function sunCaption(day: SunDay): string {
  if (!day.total) return routinesText('sunNone');
  return day.left ? routinesText('sunLeft', { count: day.left }) : routinesText('sunDone');
}

/** The day on a sun path: the sun rides a dome over a horizon from the first hour to the last, each routine's
 * window is a stroke on the dome and each item a pin at its time. It only shows; nothing on it takes a touch, so
 * it can never fight the page's scroll. VoiceOver reads it as one picture, and the lists under it say the rest. */
export function SunPath({ day, now, next = '' }: { day: SunDay; now: Date; next?: string }) {
  const { colors, ringMotion, intensity } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const box = DAY_BOX, geometry = sunGeometry(day.axis, box);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const placed = day.axis.place(nowMin), span = Math.max(1, day.axis.end - day.axis.start);
  // The sun rises along the path the first time it is shown, and after that steps a minute at a time.
  const swept = useSweep((placed - day.axis.start) / span, ringMotion === 'basic' ? 'basic' : 'calm', intensity);
  const sunMin = day.axis.start + Math.min(1, Math.max(0, swept)) * span;
  const sunX = geometry.x(sunMin), sunY = geometry.y(sunX), nowX = geometry.x(placed);
  // Hour labels stay 13pt on the screen however narrow the drawing is.
  const labelSize = width > 0 ? Math.max(13, (13 * box.width) / width) : 13;
  const firstHour = Math.ceil(day.axis.start / 60), lastHour = Math.floor(day.axis.end / 60);
  const hours = Array.from({ length: Math.max(0, lastHour - firstHour + 1) }, (_, index) => firstHour + index);
  // A label every third hour, or fewer when the day runs long, so they never touch.
  const every = hours.length > 19 ? 6 : 3;
  const caption = sunCaption(day), clock = routineClock24(nowMin);
  const inside = fontScale <= SUN_TEXT_INSIDE;
  const text = <View testID="sun-text" pointerEvents="none" style={inside ? { position: 'absolute', left: 0, right: 0, top: '34%', alignItems: 'center' } : { alignItems: 'center' }}>
    <ThemedText testID="sun-clock" variant="display" numeric>{clock}</ThemedText>
    <ThemedText testID="sun-caption" variant="caption" muted style={semibold}>{caption}</ThemedText>
  </View>;
  const moonX = box.x1 + 4, moonY = box.hy - 12;
  return <View testID="sun-path" accessible accessibilityRole="image" accessibilityLabel={sunPathLabel(day, nowMin, caption, next)}
    style={{ gap: tokens.spacing[1] }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    {!inside && text}
    <View style={{ width: '100%', aspectRatio: box.width / box.height }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${box.width} ${box.height}`} accessible={false}>
        <Defs><LinearGradient id="sun-sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.accent} stopOpacity={0.1} />
          <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
        </LinearGradient></Defs>
        <Path d={`M${box.cx - box.rx} ${box.hy} A${box.rx} ${box.ry} 0 0 1 ${box.cx + box.rx} ${box.hy} Z`} fill="url(#sun-sky)" />
        <Path d={`M${box.cx - box.rx} ${box.hy} A${box.rx} ${box.ry} 0 0 1 ${box.cx + box.rx} ${box.hy}`} fill="none" stroke={colors['hair-2']} strokeWidth={2} strokeDasharray="1 6" strokeLinecap="round" />
        {!!geometry.arc(day.axis.start, sunMin) && <Path testID="sun-travelled" d={geometry.arc(day.axis.start, sunMin)} fill="none" stroke={colors['text-muted']} strokeWidth={2} strokeLinecap="round" />}
        {day.windows.map((window) => {
          const from = day.axis.place(window.startMin), to = Math.max(from, Math.min(day.axis.end, window.endMin));
          const d = geometry.arc(from, to);
          return d ? <Path key={window.id} testID="sun-window" d={d} fill="none" stroke={slotColor(colors, window.color)} strokeWidth={5} strokeLinecap="round" /> : null;
        })}
        {day.pins.map((pin) => {
          const x = geometry.x(pin.minute), y = geometry.y(x) + 6 + PIN, tone = pin.color ? slotColor(colors, pin.color) : colors['text-muted'];
          return [
            <Line key={`${pin.id}-stem`} x1={x} y1={box.hy} x2={x} y2={Math.min(box.hy, y + PIN)} stroke={colors['hair-2']} strokeWidth={1.4} />,
            <Circle key={pin.id} testID={pin.done ? 'sun-pin-done' : 'sun-pin-open'} cx={x} cy={Math.min(box.hy - PIN, y)} r={PIN}
              fill={pin.done ? tone : colors.surface} stroke={tone} strokeWidth={1.6} />,
          ];
        })}
        <Line x1={10} y1={box.hy} x2={box.width - 10} y2={box.hy} stroke={colors['text-muted']} strokeWidth={1.4} strokeLinecap="round" />
        {hours.map((hour, index) => {
          const x = geometry.x(hour * 60), marked = index % every === 0, past = hour * 60 < placed;
          return [
            <Line key={`tick-${hour}`} x1={x} y1={box.hy + 3} x2={x} y2={box.hy + (marked ? 10 : 6)} stroke={colors['text-muted']} strokeOpacity={past ? 0.38 : 1} strokeWidth={1} />,
            marked && <SvgText key={`hour-${hour}`} x={x} y={box.hy + 24} fontSize={labelSize} fontFamily={tokens.font.numeral} fill={colors['text-muted']} textAnchor="middle">{String(hour % 24).padStart(2, '0')}</SvgText>,
          ];
        })}
        <Line x1={nowX} y1={box.hy - 2} x2={nowX} y2={box.hy + 12} stroke={colors.text} strokeWidth={2.5} strokeLinecap="round" />
        <Path d={`M${moonX + 5} ${moonY + 3}A6 6 0 0 1 ${moonX - 2} ${moonY - 5}A6 6 0 1 0 ${moonX + 5} ${moonY + 3}Z`} fill={colors['text-muted']} />
        {Array.from({ length: 12 }, (_, index) => {
          const angle = (index * Math.PI) / 6, long = index % 2 ? 3 : 5;
          return <Line key={index} x1={sunX + Math.cos(angle) * RAY_FROM} y1={sunY + Math.sin(angle) * RAY_FROM}
            x2={sunX + Math.cos(angle) * (RAY_FROM + long)} y2={sunY + Math.sin(angle) * (RAY_FROM + long)} stroke={colors.accent} strokeWidth={2} strokeLinecap="round" />;
        })}
        <Circle testID="sun-disc" cx={sunX} cy={sunY} r={SUN} fill={colors.accent} stroke={colors.bg} strokeWidth={3} />
      </Svg>
      {inside && text}
    </View>
  </View>;
}
