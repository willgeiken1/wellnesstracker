import { memo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { tokens, type ThemeColors, type ThemeMode } from '@/design/tokens';
import { t } from '@/i18n/en';
import { colorMix, rgba } from './depth';
import { FRAMES } from './geometry';
import { optionValues, optionsOf, sizesOf, stylesOf } from './model';
import { TileFrame } from './tile-frame';
import { TileIcon } from './tile-icon';
import type { TileDef, TileOptionValues, TilePageConfig, TileSize } from './types';
import { fill, sheetCard } from './ui';

export interface TrayPick { style: string; size: TileSize; options: TileOptionValues }
const SIZES: TileSize[] = ['S', 'M', 'L'];
const SIZE_WORD: Record<TileSize, string> = { S: t('tilesSizeS'), M: t('tilesSizeM'), L: t('tilesSizeL') };
/** The preview's width in the design (the card's inner width); the real width is measured. */
export const PREVIEW_W = 329;

export interface TrayCardProps {
  cfg: TilePageConfig;
  def: TileDef;
  /** The card's colour: the tile's own on a page tray, its section's on Home. */
  tint: string;
  pick: TrayPick;
  onStyle: (key: string) => void;
  onSize: (size: TileSize) => void;
  onOption: (id: string, value: string) => void;
  /** The Add button (tray); none in the customize sheet. */
  action?: ReactNode;
  /** The live preview (tray); the customize sheet previews on the page itself. */
  preview?: boolean;
  colors: ThemeColors;
  mode: ThemeMode;
  rm: boolean;
  /** The customize sheet's tighter spacing. */
  edit?: boolean;
}

/** One tile in the tray (or the customize sheet): its header, a live preview, its styles, options and sizes. */
export const TrayCard = memo(function TrayCard({ cfg, def, tint, pick, onStyle, onSize, onOption, action, preview, colors, mode, rm, edit }: TrayCardProps) {
  const home = cfg.variant === 'home';
  const [inner, setInner] = useState(PREVIEW_W);
  const versions = stylesOf(def);
  const ok = sizesOf(def, pick.style);
  const opts = optionsOf(def, pick.style);
  const cur = optionValues(def, pick.style, pick.options);
  const showStyles = home || versions.length > 1;
  const flat = versions.filter(v => !v.depth), deep = versions.filter(v => v.depth);
  const colW = Math.max(60, (inner - 12) / 3);
  const segBg = mode === 'dark' ? colors.bg : colorMix(colors.text, 0.07, colors.bg);
  const segOn = mode === 'dark'
    ? { backgroundColor: colorMix(colors.text, 0.14, colors.surface), boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }
    : { backgroundColor: colors.surface, boxShadow: `0 1px 3px ${rgba(colors.text, 0.18)}` };

  const styleBtn = (key: string, name: string, i: number, depth?: boolean) => {
    const on = key === pick.style;
    return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: on }}
      accessibilityLabel={`${fill(t('tilesStyleN'), { n: i + 1 })}, ${name}${depth ? ', depth' : ''}`} onPress={() => onStyle(key)}
      style={({ pressed }) => [s.st, { width: colW }, on
        ? { backgroundColor: rgba(tint, 0.14), boxShadow: `inset 0 0 0 1.5px ${tint}` }
        : { boxShadow: `inset 0 0 0 1px ${colors['hair-2']}` }, pressed && { opacity: 0.75 }]}>
      <Text numberOfLines={1} style={[s.stText, { color: on ? colors.text : colors['text-muted'] }]}>{name || fill(t('tilesStyleN'), { n: i + 1 })}</Text>
    </Pressable>;
  };
  const seg = (label: string, children: ReactNode) => <View style={s.ctl}>
    <Text style={[s.ctlLabel, { color: colors['text-muted'] }]}>{label}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.segScroll} contentContainerStyle={[s.seg, { backgroundColor: segBg }]}
      accessibilityRole="radiogroup" accessibilityLabel={label}>{children}</ScrollView>
  </View>;

  const f = FRAMES[pick.size], k = Math.min(1, inner / f.w), ph = Math.round(f.h * k);
  return <View accessibilityLabel={fill(t('tilesCardLabel'), { title: def.title })} style={[s.card, sheetCard(colors, mode), edit && { marginBottom: 14 }]}
    onLayout={e => setInner(Math.round(e.nativeEvent.layout.width - 28))}>
    <View style={[s.head, edit && { marginBottom: 10 }]}>
      <View style={[s.ic, { backgroundColor: rgba(tint, 0.15) }]}><TileIcon name={def.icon} size={17} color={tint} /></View>
      <View style={s.headText}>
        <Text numberOfLines={1} style={[s.title, { color: colors.text }]}>{def.title}</Text>
        {def.sub ? <Text numberOfLines={2} style={[s.sub, { color: colors['text-muted'] }]}>{def.sub}</Text> : null}
      </View>
      {action}
    </View>
    {preview ? <View style={[s.pv, { height: ph }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <View style={{ width: f.w, height: f.h, transform: [{ scale: k }], transformOrigin: 'center top' }}>
        <TileFrame cfg={cfg} def={def} entry={pick} colors={colors} mode={mode} reduceMotion={rm} preview />
      </View>
    </View> : null}
    {showStyles ? <View style={s.sts} accessibilityLabel={t('tilesStyle')}>
      {flat.map((v, i) => styleBtn(v.key, v.name, i))}
      {deep.length ? <View style={s.deepHead}>
        <Text style={[s.deepT, { color: colors['text-muted'] }]}>{t('tilesDepthStyles')}</Text>
        <Text style={[s.deepN, { color: colors['text-muted'] }]}>{t('tilesDepthNote')}</Text>
      </View> : null}
      {deep.map((v, i) => styleBtn(v.key, v.name, flat.length + i, true))}
    </View> : null}
    {opts.map(op => <View key={op.id}>{seg(op.label, op.choices.map(c => {
      const on = String(cur[op.id]) === String(c[0]);
      return <Pressable key={String(c[0])} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={c[1]}
        onPress={() => onOption(op.id, String(c[0]))} style={[s.segBtn, home ? s.opBtnHome : s.opBtn, on && segOn]}>
        <Text style={[home ? s.szText : s.opText, { color: on ? colors.text : colors['text-muted'] }]}>{c[2] ?? c[1]}</Text>
      </Pressable>;
    }))}</View>)}
    {seg(t('tilesSize'), SIZES.map(z => {
      const can = ok.includes(z), on = z === pick.size;
      return <Pressable key={z} accessibilityRole="radio" disabled={!can} accessibilityState={{ selected: on, disabled: !can }}
        accessibilityLabel={can ? SIZE_WORD[z] : fill(t(home ? 'tilesSizeOffHome' : 'tilesSizeOff'), { size: SIZE_WORD[z] })}
        onPress={() => onSize(z)} style={[s.segBtn, s.szBtn, on && segOn, !can && { opacity: 0.3 }]}>
        <Text style={[s.szText, { color: on ? colors.text : colors['text-muted'] }, !can && { textDecorationLine: 'line-through' }]}>{z}</Text>
      </Pressable>;
    }))}
  </View>;
});

/** The tray card's Add button. */
export function TrayAddButton({ label, onPress, colors }: { label: string; onPress: () => void; colors: ThemeColors }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={{ top: 6, bottom: 6 }}
    style={({ pressed }) => [s.go, { backgroundColor: colors.accent }, pressed && { opacity: 0.75 }]}>
    <TileIcon name="plus" size={15} color={colors['on-accent']} />
    <Text style={[s.goText, { color: colors['on-accent'] }]}>{t('tilesTrayAdd')}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  card: { marginBottom: 12, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 12, borderRadius: 24 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, marginBottom: 12 },
  ic: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, minWidth: 0 },
  title: { fontFamily: tokens.font.heading, fontSize: 16, lineHeight: 19.2, letterSpacing: -0.16 },
  // The design's 12.5 pt line is drawn at 13 pt, the app's smallest text size.
  sub: { marginTop: 2, fontFamily: tokens.font.body, fontSize: 13, lineHeight: 16.9 },
  go: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36, paddingHorizontal: 15, borderRadius: 999 },
  goText: { fontFamily: tokens.font.heading, fontSize: 13.5 },
  pv: { alignItems: 'center', overflow: 'hidden', borderRadius: 20 },
  sts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  st: { minHeight: 40, paddingHorizontal: 8, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stText: { fontFamily: tokens.font.bodyStrong, fontSize: 13 },
  deepHead: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6, marginHorizontal: 4 },
  deepT: { fontFamily: tokens.font.bodyStrong, fontSize: 13 },
  deepN: { fontFamily: tokens.font.body, fontSize: 13, opacity: 0.8 },
  ctl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10, paddingLeft: 4, paddingRight: 2 },
  ctlLabel: { flexShrink: 0, fontFamily: tokens.font.bodyStrong, fontSize: 13 },
  segScroll: { flexGrow: 0, flexShrink: 1 },
  seg: { flexDirection: 'row', gap: 2, padding: 2, borderRadius: 12 },
  segBtn: { minHeight: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  szBtn: { width: 52 },
  szText: { fontFamily: tokens.font.heading, fontSize: 13 },
  opBtn: { minWidth: 48, paddingHorizontal: 11 },
  opBtnHome: { minWidth: 52, paddingHorizontal: 12 },
  opText: { fontFamily: tokens.font.bodyStrong, fontSize: 13 },
});
