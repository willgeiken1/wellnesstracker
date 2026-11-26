import { useState, type ReactNode } from 'react';
import { View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { Icon, KitText, PressScale, Tappable, alpha, mix, slopFor, useKit, type IconName } from '@/components/kit';
import { capitals } from '@/components/kit-style';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { raised } from '../../tiles/depth';
import { TileSurface } from '../../tiles/tile-surface';
import { fill } from '../../tiles/ui';
import { toggleDone, toggleSkip } from '../actions';
import { daysWord, h12, markOf, type Item, type Now, type RoutinesState } from '../model';
import { Tick, checkLabel } from '../rows';
import type { RoutinesStore } from '../store';

/* The Routines tiles' own type and parts (pagetiles-routines.js: rtt-n, rtt-s, rtt-t, rtt-k, rtt-hd, rtt-btn, rtt-ck, rtt-ir, rtt-seg). */

/** What every tile body gets: the state, now, the store, and whether its controls are live. */
export interface Ctx { s: RoutinesState; n: Now; store: RoutinesStore; live: boolean; w: number; h: number }

/** A big number with its small unit (`.rtt-n`). */
/** Nested text takes its parent's tracking unless it sets its own; a unit after a tightly tracked number reads untracked. */
const UNTRACKED = 0.0001;
/** A caption smaller than the kit's 11 pt text floor, drawn as chart lettering the way the mockup sets it (week letters, day labels). */
export function Caption({ w, h, size, color, text }: { w: number; h: number; size: number; color: string; text: string }) {
  return <Svg width={w} height={h} accessible={false}>
    <SvgText x={w / 2} y={h / 2 + size * 0.36} textAnchor="middle" fill={color} fontFamily={tokens.font.heading} fontSize={size}>{text}</SvgText>
  </Svg>;
}
export function Num({ v, unit, fs = 32, color, style }: { v: string | number; unit?: string; fs?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <KitText weight={700} size={fs} lineHeight={1} tracking={-0.03} numeric color={color} numberOfLines={1} style={style}>
    {String(v)}{unit ? <KitText weight={600} size={13} tracking={UNTRACKED} color="text-muted">{` ${unit}`}</KitText> : null}
  </KitText>;
}
/** The muted small line (`.rtt-s`). */
export function Sub({ children, style, lines = 1, color, size = 12.5 }: { children: ReactNode; style?: StyleProp<TextStyle>; lines?: number; color?: string; size?: number }) {
  return <KitText weight={500} size={size} lineHeight={1.35} color={color ?? 'text-muted'} numberOfLines={lines} style={style}>{children}</KitText>;
}
export function B({ children, size = 12.5 }: { children: ReactNode; size?: number }) { return <KitText weight={600} size={size} color="text">{children}</KitText>; }
/** A title line (`.rtt-t`). */
export function Title({ children, size = 15, style, lines = 1 }: { children: ReactNode; size?: number; style?: StyleProp<TextStyle>; lines?: number }) {
  return <KitText weight={600} size={size} lineHeight={1.25} numberOfLines={lines} style={style}>{children}</KitText>;
}
/** Small capitals (`.rtt-k`), muted or in the tile colour. */
export function Kick({ children, color, style, size = 10.5 }: { children: ReactNode; color?: string; style?: StyleProp<TextStyle>; size?: number }) {
  return <KitText weight={700} size={Math.max(11, size)} lineHeight={1} tracking={size < 10.5 ? 0.04 : 0.1} color={color ?? 'text-muted'} numberOfLines={1} style={[capitals, style]}>{children}</KitText>;
}
export const Hair = () => { const k = useKit(); return <View style={{ height: 1, backgroundColor: k.c.hair }} />; };
export const Dot = ({ color, size = 8 }: { color: string; size?: number }) => <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, flexShrink: 0 }} />;

/** The header a tile draws itself when it takes a routine colour (`.rtt-hd`). */
export function Head({ icon, title, meta, color }: { icon: IconName; title: string; meta?: string; color: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 20 }}>
    <Icon name={icon} size={18} color={color} />
    <KitText weight={600} size={14} numberOfLines={1} style={{ flexShrink: 1 }}>{title}</KitText>
    {meta ? <KitText weight={500} size={13} numeric color="text-muted" numberOfLines={1} style={{ marginLeft: 'auto', paddingLeft: 6 }}>{meta}</KitText> : null}
  </View>;
}

/** The recessed well colour (`.rtt-well`), flat for the small segments. */
export const wellColor = (k: ReturnType<typeof useKit>) => (k.dark ? mix(k.c.surface, k.c.bg, 0.6) : mix(k.c.text, k.c.bg, 0.07));

/** One segment per item: done in the routine colour, skipped as an outline, still to do as a well (`.rtt-seg`). */
export function Segs({ s, n, items, color, h = 6 }: { s: RoutinesState; n: Now; items: Item[]; color: string; h?: number }) {
  const k = useKit(), well = wellColor(k);
  return <View style={{ flexDirection: 'row', gap: 3, height: h }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {(items.length ? items : [null]).map((i, j) => {
      const m = i ? markOf(s, n.day, i.id) : null;
      return <View key={i?.id ?? j} style={{ flex: 1, minWidth: 0, borderRadius: 3, backgroundColor: m === 'd' ? color : m === 's' ? 'transparent' : well,
        borderWidth: m === 's' ? 1.2 : 0, borderColor: k.c['hair-2'] }} />;
    })}
  </View>;
}

/** A ring (`ring`): a soft track and a round-capped arc, something drawn inside. */
export function RingG({ size, sw, frac, color, children, label }: { size: number; sw: number; frac: number; color: string; children?: ReactNode; label?: string }) {
  const c = size / 2, r = (size - sw) / 2, C = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac));
  return <View accessible={!!label} accessibilityRole={label ? 'image' : undefined} accessibilityLabel={label} style={{ width: size, height: size }}>
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={c} cy={c} r={r} fill="none" stroke={alpha(color, 0.18)} strokeWidth={sw} />
      {f > 0 ? <Circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" rotation={-90} origin={`${c}, ${c}`} strokeDasharray={`${(C * f).toFixed(1)} ${C.toFixed(1)}`} /> : null}
    </Svg>
    {children ? <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>{children}</View> : null}
  </View>;
}

/** A tile button (`.rtt-btn`): raised in the tile colour, `ghost` as a soft tint, `quiet` as an outline. */
export function TBtn({ label, icon, onPress, kind = 'fill', color, full, live, spoken, h = 34, fs = 13.5 }: {
  label: string; icon?: IconName; onPress: () => void; kind?: 'fill' | 'ghost' | 'quiet'; color: string; full?: boolean; live: boolean; spoken?: string; h?: number; fs?: number;
}) {
  const k = useKit(), [w, setW] = useState(0);
  const ink = kind === 'fill' ? k.c['on-accent'] : kind === 'ghost' ? color : k.c['text-muted'];
  return <PressScale accessibilityRole="button" accessibilityLabel={spoken ?? label} onPress={onPress} disabled={!live} hitSlop={slopFor(10, h)} onLayout={e => setW(e.nativeEvent.layout.width)}
    style={{ height: h, borderRadius: 11, paddingHorizontal: h < 30 ? 10 : 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: kind === 'ghost' ? alpha(color, 0.15) : undefined, borderWidth: kind === 'quiet' ? 1 : 0, borderColor: k.c['hair-2'],
      alignSelf: full ? 'stretch' : 'flex-start' } as ViewStyle}>
    {kind === 'fill' && w ? <TileSurface spec={raised(color, k.mode, 11)} width={w} height={h} /> : null}
    {icon ? <View><Icon name={icon} size={h < 30 ? 14 : 16} color={ink} /></View> : null}
    <KitText weight={700} size={fs} color={ink} numberOfLines={1}>{label}</KitText>
  </PressScale>;
}

/** The check-off in a tile row (`.rtt-ck`): 24 pt ring in a 40 pt box. */
export function Ck({ i, c, next }: { i: Item; c: Ctx; next?: boolean }) {
  const k = useKit(), done = markOf(c.s, c.n.day, i.id) === 'd', color = colorOfItem(c, i, k);
  return <Tappable dim="none" disabled={!c.live} accessibilityRole="checkbox" accessibilityLabel={checkLabel(i)} accessibilityState={{ checked: done }}
    onPress={() => toggleDone(c.store, i.id)} hitSlop={2} style={{ width: 40, height: 40, marginRight: -8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? color : 'transparent',
      borderWidth: done ? 0 : next ? 1.8 : 1.6, borderColor: next ? color : alpha(k.c['text-muted'], 0.8) }}>
      {done ? <Tick color={k.c['on-accent']} /> : null}
    </View>
  </Tappable>;
}
export const colorOfItem = (c: Ctx, i: Item, k: ReturnType<typeof useKit>) => k.c[c.s.routines.find(r => r.id === i.routines[0])?.color ?? 'sleep'];

/** An item row in a tile (`.rtt-ir`): time, name and dose, Skip on the next one, and the check-off. */
export function IRow({ i, c, next, h, skip, first, color }: { i: Item; c: Ctx; next: boolean; h: number; skip?: boolean; first: boolean; color: string }) {
  const k = useKit(), m = markOf(c.s, c.n.day, i.id), done = m === 'd', sk = m === 's';
  return <View style={{ height: h, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: first ? 0 : 1, borderTopColor: k.c.hair }}>
    <KitText weight={600} size={12} numeric color={next ? color : 'text-muted'} numberOfLines={1} style={{ width: 58, flexShrink: 0, opacity: sk ? 0.5 : 1 }}>{h12(i.h)}</KitText>
    <View style={{ flex: 1, minWidth: 0, gap: 1, opacity: sk ? 0.5 : 1 }}>
      <KitText weight={600} size={14} lineHeight={1.2} numberOfLines={1} style={done ? { textDecorationLine: 'line-through', opacity: 0.55 } : undefined}>{i.name}</KitText>
      <KitText weight={500} size={12} lineHeight={1.2} color="text-muted" numberOfLines={1}>{i.dose}</KitText>
    </View>
    {skip && !done ? <Tappable dim="row" disabled={!c.live} accessibilityRole="button" accessibilityLabel={fill(t(sk ? 'routinesUndoSkipFor' : 'routinesSkipToday'), { name: i.name })}
      onPress={() => toggleSkip(c.store, i.id)} hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }}
      style={{ flexShrink: 0, borderRadius: 999, borderWidth: 1, borderColor: k.c['hair-2'], paddingVertical: 4, paddingHorizontal: 10 }}>
      <KitText weight={600} size={12} color="text-muted">{t(sk ? 'routinesSkipped' : 'routinesSkip')}</KitText>
    </Tappable> : null}
    <Ck i={i} c={c} next={next} />
  </View>;
}
/** An item not due today, in a tile. */
export function OffIRow({ i, h, first }: { i: Item; h: number; first: boolean }) {
  const k = useKit();
  return <View style={{ height: h, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: first ? 0 : 1, borderTopColor: k.c.hair }}>
    <KitText weight={600} size={12} numeric color="text-muted" style={{ width: 58, opacity: 0.5 }}>{h12(i.h)}</KitText>
    <View style={{ flex: 1, minWidth: 0, gap: 1, opacity: 0.5 }}>
      <KitText weight={600} size={14} lineHeight={1.2} numberOfLines={1}>{i.name}</KitText>
      <KitText weight={500} size={12} lineHeight={1.2} color="text-muted" numberOfLines={1}>{i.dose}</KitText>
    </View>
    <KitText weight={600} size={11.5} color="text-muted">{fill(t('routinesNotToday'), { days: daysWord(i.days) })}</KitText>
  </View>;
}

/** A soft square icon (`.rtt-ic`). */
export function Ic({ name, color }: { name: IconName; color: string }) {
  return <View style={{ width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(color, 0.15) }}><Icon name={name} size={19} color={color} /></View>;
}
