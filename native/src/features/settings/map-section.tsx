import { useMemo } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Icon, KitText, List, ListFooter, SegmentedControl, Tappable, useKit } from '@/components/kit';
import { useTheme } from '@/design/theme-provider';
import { useMapPrefs, type MapPrefs, type MapStyle } from '@/features/home/hero/prefs';
import { ridgeColors, ridgeScene, type RidgeState } from '@/features/home/hero/ridge-scene';
import { tones } from '@/features/home/hero/tones';
import { showToast } from '@/features/shell/toast';
import { st } from './copy';
import { Gap, H, ListRow, Panel } from './ui';

const f1 = (n: number) => String(Math.round(n * 10) / 10);

/** The Aurora option's picture (mockup `heroStylePreview(0)`): the night limb with its three pillar gauges, a ring of
 * contours on each hill and the score above. Drawn in the current palette and look. */
export function auroraPreview(c: Record<string, string>, mode: 'dark' | 'light') {
  const T = tones(c, mode), dk = mode !== 'light', W = 120, H = 78, cx = 60, R = 170, cy = 36 + R;
  const limbY = (x: number) => cy - Math.sqrt(R * R - (x - cx) * (x - cx));
  const arc = (x0: number, x1: number) => `M${f1(x0)} ${f1(limbY(x0))}A${R} ${R} 0 0 1 ${f1(x1)} ${f1(limbY(x1))}`;
  const col: Record<string, string> = { training: c.training, food: c.food, sleep: c.sleep }, fg = dk ? '#FFFFFF' : c.text;
  const hills: [number, number, string][] = [[34, 54, 'training'], [86, 52, 'food'], [61, 64, 'sleep']];
  let o = `<defs><clipPath id="pvc"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>` +
    `<linearGradient id="pvg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.limb}"/><stop offset=".35" stop-color="${T.base}"/></linearGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="${c.bg}"/>`;
  if (dk) o += `<path d="${arc(-20, 140)}" fill="none" stroke="${T.air}" stroke-opacity=".18" stroke-width="6"/>`;
  o += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#pvg)"/><g clip-path="url(#pvc)">`;
  for (const [x, y, k] of hills) for (let q = 0; q < 3; q++) {
    const rx = 15 - q * 4.5, ry = 5.4 - q * 1.6, yy = y - q * 2.4;
    o += `<ellipse cx="${x}" cy="${f1(yy)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="none" stroke="${col[k]}" stroke-opacity="${dk ? 0.22 : 0.16}" stroke-width="3"/>` +
      `<ellipse cx="${x}" cy="${f1(yy)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="none" stroke="${dk ? '#FFFFFF' : col[k]}" stroke-opacity="${dk ? 0.8 : 0.9}" stroke-width=".8"/>`;
  }
  o += '</g>';
  // The limb gauge: Training, Sleep, Food in screen order.
  o += `<path d="${arc(-20, 140)}" fill="none" stroke="${T.air}" stroke-opacity="${dk ? 0.5 : 0.35}" stroke-width=".7"/>`;
  for (const [a, b, k, v] of [[9, 40, 'training', 0.4], [44, 76, 'sleep', 0.86], [80, 111, 'food', 0.62]] as const) {
    o += `<path d="${arc(a, b)}" fill="none" stroke="${fg}" stroke-opacity=".16" stroke-width="1.4" stroke-linecap="round"/>` +
      `<path d="${arc(a, a + (b - a) * v)}" fill="none" stroke="${col[k]}" stroke-width="1.8" stroke-linecap="round"/>`;
  }
  o += `<text x="60" y="${f1(limbY(60) - 8)}" text-anchor="middle" font-family="PlusJakartaSans_700Bold" font-size="15" letter-spacing="-.5" fill="${fg}">63</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${o}</svg>`;
}

/** The sample day both previews show (the mockup's SAMPLE): 63, training at 40%, food at 62%, sleep met. */
const SAMPLE: RidgeState = {
  v: [0.4, 0.62, 1], met: [0, 0, 1], rest: [false, false, false],
  tok: [[['24', 'v', 0], ['min', 'u', 2.5]], [['1,364', 'v', 0], ['kcal', 'u', 2.5]], [['8', 'v', 0], ['h', 'u', 0.5]]],
  of: ['', '', ''], label: ['Training', 'Food', 'Sleep'], pct: '63', cap: '', r: 1, ta: 1, f: [1, 1, 1],
};
/** The Ridgeline option's picture: the Home ridge scene, cropped to its peaks, with lines drawn 2.2 times as thick so they read small. */
export function ridgePreview(c: Record<string, string>, mode: 'dark' | 'light') {
  const K = ridgeColors(c, mode), W = 402, H = 352;
  const scene = ridgeScene(W, H, SAMPLE, K, { uid: 'pvr', detail: 1, labels: false, glow: 0.6 })
    .replace(/stroke-width="([\d.]+)"/g, (_, w: string) => `stroke-width="${f1(Number(w) * 2.2)}"`);
  return `<svg viewBox="0 44 ${W} 262" preserveAspectRatio="xMidYMid slice"><rect x="0" y="0" width="${W}" height="${H}" fill="${K.bg}"/>${scene}</svg>`;
}

const STYLES: { id: MapStyle; name: 'settingsMapAurora' | 'settingsMapRidge'; line: 'settingsMapAuroraLine' | 'settingsMapRidgeLine'; draw: typeof auroraPreview }[] = [
  { id: 'aurora', name: 'settingsMapAurora', line: 'settingsMapAuroraLine', draw: auroraPreview },
  { id: 'ridge', name: 'settingsMapRidge', line: 'settingsMapRidgeLine', draw: ridgePreview },
];

/** `.ms-opt`: a 92 x 60 pt picture of the style, its name and line, and a round check. */
function StyleOption({ id, name, line, xml, selected, first, onPress }: { id: MapStyle; name: string; line: string; xml: string; selected: boolean; first: boolean; onPress: () => void }) {
  const k = useKit();
  return <Tappable dim="fill" testID={`appearance-map-style-${id}`} accessibilityRole="radio" accessibilityLabel={`${name}. ${line}`} accessibilityState={{ checked: selected }}
    onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 76, paddingVertical: 10, paddingLeft: 12, paddingRight: 16 }}>
    {!first && <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, left: 0, height: 1, backgroundColor: k.c.hair }} />}
    <View style={{ width: 92, height: 60, borderRadius: 12, overflow: 'hidden', boxShadow: `0px 0px 0px ${selected ? 2 : 1}px ${selected ? k.c.accent : k.c['hair-2']}` }}>
      <SvgXml xml={xml} width={92} height={60} />
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <KitText weight={600} size={15.5} lineHeight={1.25}>{name}</KitText>
      <KitText weight={500} size={13} lineHeight={1.3} color="text-muted" style={{ marginTop: 2 }}>{line}</KitText>
    </View>
    <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
      backgroundColor: selected ? k.c.accent : 'transparent', boxShadow: selected ? undefined : `inset 0px 0px 0px 1.5px ${k.c['hair-2']}` }}>
      {selected ? <Icon name="check" size={14} color={k.c['on-accent']} /> : null}
    </View>
  </Tappable>;
}

function Seg<T extends string>({ title, sub, value, options, onChange }: { title: string; sub?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return <ListRow title={title} sub={sub} right={<View style={{ width: 150 }}><SegmentedControl compact label={title} value={value} options={options} onChange={onChange} /></View>} />;
}

const DETAIL = [0, 1, 2] as const, GLOW = [0, 0.5, 1] as const;
const nearest = <T extends number>(list: readonly T[], v: number) => list.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);

/** Appearance › Home: the Insight map on Home. Show it or not, the artwork or numbers only, its style, and how it draws.
 * Every change saves at once and Home follows (features/home/hero/prefs). */
export function MapSection() {
  const { colors, mode } = useTheme();
  const [m, set] = useMapPrefs();
  const xml = useMemo(() => Object.fromEntries(STYLES.map(s => [s.id, s.draw(colors, mode)])) as Record<MapStyle, string>, [colors, mode]);
  const tog = (title: string, key: keyof MapPrefs, sub?: string) =>
    <ListRow key={key} testID={`appearance-map-${key}`} title={title} sub={sub} toggle={m[key] as boolean} onToggle={v => set({ [key]: v })} />;
  return <>
    <H>{st('settingsMapHome')}</H>
    <List>{tog(st('settingsMapHero'), 'hero', st(m.hero ? 'settingsMapHeroOn' : 'settingsMapHeroOff'))}</List>
    {!m.hero ? <ListFooter>{st('settingsMapOffFoot')}</ListFooter> : <>
      <Gap />
      <List>{tog(st('settingsMapMap'), 'map', st(m.map ? 'settingsMapMapOn' : 'settingsMapMapOff'))}</List>
      {m.map ? <>
        <H>{st('settingsMapStyle')}</H>
        <Panel testID="appearance-map-styles">
          <View accessibilityRole="radiogroup" accessibilityLabel={st('settingsMapStyle')}>
            {STYLES.map((s, i) => <StyleOption key={s.id} id={s.id} name={st(s.name)} line={st(s.line)} xml={xml[s.id]} first={i === 0}
              selected={m.style === s.id} onPress={() => set({ style: s.id })} />)}
          </View>
        </Panel>
      </> : null}
      <Gap />
      <List footer={(m.map ? st('settingsMapSameNumbers') + ' ' : '') + st('settingsMapReduceMotion')}>
        {m.map ? <Seg title={st('settingsMapDetail')} value={String(m.detail) as '0' | '1' | '2'} onChange={v => set({ detail: Number(v) as 0 | 1 | 2 })}
          options={DETAIL.map(v => ({ value: String(v) as '0' | '1' | '2', label: st((['settingsMapLight', 'settingsMapMedium', 'settingsMapRich'] as const)[v]) }))} /> : null}
        {m.map ? <Seg title={st('settingsMapGlow')} value={String(nearest(GLOW, m.glow))} onChange={v => set({ glow: Number(v) })}
          options={GLOW.map((v, i) => ({ value: String(v), label: st((['settingsMapOff', 'settingsMapSoft', 'settingsMapFull'] as const)[i]) }))} /> : null}
        <Seg title={st('settingsMapMotion')} sub={st(m.motion === 'calm' ? 'settingsMapCalmSub' : 'settingsMapFullSub')} value={m.motion} onChange={v => set({ motion: v })}
          options={[{ value: 'full', label: st('settingsMapFull') }, { value: 'calm', label: st('settingsMapCalm') }]} />
        {m.map ? tog(st('settingsMapLabels'), 'labels') : null}
        {tog(st('settingsMapLines'), 'lines')}
        {tog(st('settingsMapWeek'), 'week')}
      </List>
      <Gap />
      <List>
        <ListRow testID="appearance-map-reset" title={st('settingsMapReset')} chevron={false}
          onPress={() => { set(null); showToast(st('settingsMapResetToast')); }} />
      </List>
    </>}
  </>;
}

