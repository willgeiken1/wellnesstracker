import type { ReactNode, RefObject } from 'react';
import { ScrollView, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Icon, NavBar, StackGapContext, SurfaceContext, font, mix, useKit, type IconName } from '@/components/kit';

/* The pieces the Progress screens and sheets share (the mockup's .pg-* classes). */

const tab = { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] };

/** A pushed screen: the bar with its back button, then the page scroll (16 pt sides, 12 pt between blocks). */
export interface Scroller { scrollTo(o: { y: number; animated?: boolean }): void }
export function Page({ back, title, right, children, testID, scrollRef }: { back: string; title: string; right?: ReactNode; children: ReactNode; testID?: string; scrollRef?: RefObject<Scroller | null> }) {
  const k = useKit(), insets = useSafeAreaInsets();
  return <View testID={testID} style={{ flex: 1, backgroundColor: k.c.bg }}>
    {/* The bar reaches 16 pt past its parent's sides, as on a page with 16 pt margins. */}
    <View style={{ paddingHorizontal: 16, zIndex: 5 }}><NavBar back={back} title={title} right={right} /></View>
    <ScrollView ref={scrollRef as never} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 + insets.bottom, gap: 12 }}>
      <StackGapContext.Provider value={12}><SurfaceContext.Provider value="page">{children}</SurfaceContext.Provider></StackGapContext.Provider>
    </ScrollView>
  </View>;
}

/** Grey small text (.pg-cap); `B` inside it is bold. */
export function Cap({ children, style, size = 12.5 }: { children: ReactNode; style?: StyleProp<TextStyle>; size?: number }) {
  const k = useKit(); return <Text style={[font(600, size, 1.35), { color: k.c['text-muted'] }, style]}>{children}</Text>;
}
/** Body text (.pg-txt). */
export function Txt({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const k = useKit(); return <Text style={[font(500, 14, 1.45), { color: k.c['text-muted'] }, style]}>{children}</Text>;
}
/** Bold text inside Cap or Txt. */
export const Bold = ({ children }: { children: ReactNode }) => { const k = useKit(); return <Text style={[font(700, 14), { color: k.c.text }]}>{children}</Text>; };
export const CapB = ({ children }: { children: ReactNode }) => { const k = useKit(); return <Text style={[font(700, 12.5), tab, { color: k.c.text }]}>{children}</Text>; };

/** A number in the screen styles: big 44, mid 30, small 21, with a small grey unit. */
export function Big({ v, unit, size = 'big', color, units }: { v?: string | number; unit?: string; size?: 'big' | 'mid' | 'sm'; color?: string; units?: (readonly [string, string])[] }) {
  const k = useKit(), [fs, lh, tr, us] = size === 'big' ? [44, 1, -0.045, 15] : size === 'mid' ? [30, 1.05, -0.04, 15] : [21, 1.1, -0.03, 12.5];
  // Number and unit sit on one baseline, the unit 3 pt after its number (.pg-big small { margin-left: 3px }); an hours and
  // minutes value keeps a word space between its groups.
  const groups: (readonly [string, string | undefined])[] = units ?? [[v == null ? '' : String(v), unit]];
  const said = groups.map(([n, u]) => u ? `${n} ${u}` : n).join(' ');
  return <View accessible accessibilityLabel={said} style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'nowrap' }}>
    {groups.map(([n, u], i) => <View key={i} style={{ flexDirection: 'row', alignItems: 'baseline', marginLeft: i ? fs * 0.25 : 0 }}>
      <Text numberOfLines={1} style={[font(700, fs, lh, tr), tab, { color: color ?? k.c.text }]}>{n}</Text>
      {u ? <Text numberOfLines={1} style={[font(600, us), { color: k.c['text-muted'], letterSpacing: 0, marginLeft: 3 }]}>{u}</Text> : null}
    </View>)}
  </View>;
}
export const Divider = ({ style }: { style?: StyleProp<ViewStyle> }) => { const k = useKit(); return <View style={[{ height: 1, backgroundColor: k.c.hair, marginTop: 16, marginBottom: 14 }, style]} />; };
/** Two things on one line, pushed apart (.pg-split). */
export const Split = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) =>
  <View style={[{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }, style]}>{children}</View>;
/** Three columns split by hairlines (.pg-3). */
export function Three({ children }: { children: ReactNode[] }) {
  const k = useKit();
  return <View style={{ flexDirection: 'row', gap: 8 }}>{children.map((c, i) => <View key={i} style={{ flex: 1, minWidth: 0, paddingLeft: i ? 12 : 0, borderLeftWidth: i ? 1 : 0, borderLeftColor: k.c.hair }}>{c}</View>)}</View>;
}
/** The three-number strip under a chart (.pg-stats). */
export function Stats({ items }: { items: { l: string; v: ReactNode; s?: string }[] }) {
  const k = useKit();
  return <View style={{ flexDirection: 'row', backgroundColor: k.cardBg, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 4, boxShadow: k.cardEdge }}>
    {items.map((x, i) => <View key={i} style={{ flex: 1, paddingHorizontal: 12, borderLeftWidth: i ? 1 : 0, borderLeftColor: k.c.hair }}>
      <Text style={[font(600, 12), { color: k.c['text-muted'] }]}>{x.l}</Text>
      <View style={{ marginTop: 4 }}>{x.v}</View>
      {x.s ? <Text style={[font(500, 11.5), { color: k.c['text-muted'], marginTop: 2 }]}>{x.s}</Text> : null}
    </View>)}
  </View>;
}
/** A stat value (.pg-stats .v). */
export function StatV({ v, unit }: { v: string; unit?: string }) {
  const k = useKit();
  return <Text numberOfLines={1} style={[font(700, 19, 1.2, -0.025), tab, { color: k.c.text }]}>{v}{unit ? <Text style={[font(600, 12), { color: k.c['text-muted'], letterSpacing: 0 }]}>{' '}{unit}</Text> : null}</Text>;
}
/** The small icon square (.pg-ic). */
export const Ic = ({ icon, color, size = 28 }: { icon: string; color: string; size?: number }) => {
  const k = useKit(), c = k.tok(color);
  return <View style={{ width: size, height: size, borderRadius: size > 30 ? 10 : 9, alignItems: 'center', justifyContent: 'center', backgroundColor: mix(c, 'transparent', 0.16) }}><Icon name={icon as IconName} size={size > 30 ? 18 : 16} color={c} /></View>;
};
/** A card heading with an icon and an optional source pill (.pg-ic + .pg-ht + .pg-src). */
export function CardHead({ icon, color, title, sub, src }: { icon: string; color: string; title: string; sub?: string; src?: ReactNode }) {
  const k = useKit();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
    <Ic icon={icon} color={color} />
    <View style={{ flex: 1, minWidth: 0 }}><Text style={[font(700, 16, undefined, -0.015), { color: k.c.text }]}>{title}</Text>{sub ? <Text style={[font(600, 12), { color: k.c['text-muted'], marginTop: 1 }]}>{sub}</Text> : null}</View>
    {src}
  </View>;
}
export function Src({ text, icon }: { text: string; icon?: string }) {
  const k = useKit();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, paddingHorizontal: 8, borderRadius: 999, backgroundColor: k.dark ? k.c['surface-2'] : mix(k.c.text, k.c.bg, 0.04) }}>
    <Icon name={(icon ?? (text === 'Oura' ? 'ring' : text === 'Apple Health' ? 'apple' : 'check')) as IconName} size={12} color={k.c['text-muted']} /><Text style={[font(700, 11), { color: k.c['text-muted'] }]}>{text}</Text></View>;
}
export { Card, ListFooter as Foot } from '@/components/kit';
/** Minutes as the hour and minute groups of a big number. */
export const hmUnits = (min: number): [string, string][] => { const m = Math.round(min); return [[String(Math.floor(m / 60)), 'h'], [String(m % 60), 'm']]; };
