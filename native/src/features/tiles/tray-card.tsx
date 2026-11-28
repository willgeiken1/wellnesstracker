import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { font } from '@/components/kit-style';
import type { ThemeColors, ThemeMode } from '@/design/tokens';
import { t } from '@/i18n/en';
import { rgba } from './depth';
import { EdGlyph } from './editor/glyphs';
import { StageGlow } from './editor/stage';
import { FRAMES } from './geometry';
import { isSwatch, TINT_KEY } from './look';
import { sizesOf, stylesOf } from './model';
import { TileFrame } from './tile-frame';
import { TileIcon } from './tile-icon';
import type { TileDef, TileOptionValues, TilePageConfig, TileSize } from './types';
import { fill, sheetCard } from './ui';

/** A tile not on the page yet, as it will be added: its style, size and options. */
export interface TrayPick { style: string; size: TileSize; options: TileOptionValues }
/** The width a Medium tile draws at; a card's preview scales it to fit. */
const ROW_W = 358;

export interface TrayCardProps {
  cfg: TilePageConfig;
  def: TileDef;
  /** The card's colour: the tile's own on a page, its section's on Home (a colour picked for the tile wins). */
  tint: string;
  pick: TrayPick;
  /** Opens the tile's preview, to choose its style, size and the rest before adding it. */
  onOpen: () => void;
  /** Adds the tile as the card shows it. */
  onAdd: () => void;
  colors: ThemeColors;
  mode: ThemeMode;
  rm: boolean;
}

/** The colour a tray card takes: one picked for the tile, else the card's own. */
export function cardTint(colors: ThemeColors, pick: TrayPick, own: string) {
  const k = pick.options[TINT_KEY];
  return isSwatch(k) ? (colors[k as keyof ThemeColors] as string) ?? own : own;
}

/**
 * One tile in Add a tile: the tile itself, live, on a soft stage in its colour, then its name, what it is, how many styles it
 * comes in and Add. Add puts it on the page as it is; a tap anywhere else opens its preview to choose how it looks first.
 */
export const TrayCard = memo(function TrayCard({ cfg, def, tint, pick, onOpen, onAdd, colors, mode, rm }: TrayCardProps) {
  const [stageW, setStageW] = useState(342);
  const [held, setHeld] = useState(false);
  const f = FRAMES[pick.size] ?? FRAMES.M;
  const k = Math.min((stageW / ROW_W) * 0.84, 168 / f.h, 1);
  const n = stylesOf(def).length, sizes = sizesOf(def, pick.style).length;
  const meta = n > 1 ? fill(t('tilesTrayStyles'), { n }) : sizes > 1 ? fill(t('tilesTraySizes'), { n: sizes }) : t('tilesTrayCustomize');
  const press = { onPressIn: () => setHeld(true), onPressOut: () => setHeld(false), onPress: onOpen };
  return <View testID={`tray-card-${def.id}`} style={[s.card, sheetCard(colors, mode), mode === 'dark' && { backgroundColor: colors['surface-2'] },
    held && !rm && { transform: [{ scale: 0.985 }] }]}>
    <Pressable {...press} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden testID={`tray-stage-${def.id}`}
      onLayout={e => setStageW(e.nativeEvent.layout.width)} style={[s.pv, { boxShadow: `inset 0 0 0 1px ${colors.hair}` }]}>
      <StageGlow tint={tint} colors={colors} dark={mode === 'dark'} />
      <View pointerEvents="none" style={{ width: f.w * k, height: f.h * k }}>
        <View style={{ width: f.w, height: f.h, transform: [{ scale: k }], transformOrigin: 'left top' }}>
          <TileFrame cfg={cfg} def={def} entry={pick} colors={colors} mode={mode} reduceMotion={rm} preview />
        </View>
      </View>
    </Pressable>
    <View style={s.row}>
      <Pressable {...press} accessibilityRole="button" style={s.main}
        accessibilityLabel={fill(t('tilesTrayOpen'), { title: def.title, sub: def.sub ? `${def.sub}.` : '', meta })}>
        <View style={[s.ic, { backgroundColor: rgba(tint, 0.15) }]}><TileIcon name={def.icon} size={16} color={tint} /></View>
        <View style={s.text}>
          <Text numberOfLines={1} style={[s.title, { color: colors.text }]}>{def.title}</Text>
          {def.sub ? <Text numberOfLines={2} style={[s.sub, { color: colors['text-muted'] }]}>{def.sub}</Text> : null}
          <View style={s.more}>
            <Text style={[s.moreT, { color: colors['text-muted'] }]}>{meta}</Text>
            <EdGlyph name="chevron-right" size={13} color={colors['text-muted']} />
          </View>
        </View>
      </Pressable>
      <TrayAddButton colors={colors} onPress={onAdd} label={fill(t('tilesTrayAddAsIs'), { title: def.title, page: cfg.label })} />
    </View>
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
  card: { marginBottom: 12, paddingTop: 8, paddingHorizontal: 8, paddingBottom: 12, borderRadius: 26 },
  pv: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, marginHorizontal: 6 },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  ic: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  title: font(600, 15.5),
  sub: { marginTop: 2, ...font(500, 12.5, 1.35) },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 3 },
  moreT: font(600, 12.5),
  go: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36, paddingHorizontal: 15, borderRadius: 999 },
  goText: { ...font(700, 13.5) },
});
