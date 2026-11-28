import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { capitals, font } from '@/components/kit-style';
import { GRABBER_ROOM } from '@/components/sheet';
import { Tappable } from '@/components/tappable';
import { useTheme } from '@/design/theme-provider';
import { tokens, type ThemeColors, type ThemeMode } from '@/design/tokens';
import { useSettingsPrefs } from '@/features/settings/prefs';
import type { UnitKey } from '@/features/settings/unit-override';
import { showToast } from '@/features/shell/toast';
import { t, type MessageKey } from '@/i18n/en';
import { colorMix, rgba } from '../depth';
import { FRAMES } from '../geometry';
import { SWATCHES, TILE_GOALS, TILE_UNITS, TINT_KEY, canTint, isSwatch, ownToken, tileUnits, type GoalKey } from '../look';
import { defaultStyle, firstSize, optionValues, optionsOf, sameOptions, sizesOf, stylesOf } from '../model';
import { tileRoutes } from '../nav';
import { tileEdit, type TileStorage } from '../store';
import { TileFrame } from '../tile-frame';
import { TileIcon } from '../tile-icon';
import { isTilePage } from '../tray-sheet';
import type { LayoutEntry, TileDef, TileOptionValues, TilePageConfig, TilePageId, TileSize } from '../types';
import { EmptyBlock, SheetHeader, fill, sheetBg } from '../ui';
import { useTileRepository, useTileStore } from '../use-tiles';
import { EdGlyph, SizeGlyph } from './glyphs';
import { GOALS, stepGoal, type GoalCtx } from './goals';
import { TileStage, type Change } from './stage';

type Pick0 = Pick<LayoutEntry, 'style' | 'size' | 'options'>;
const SIZES: TileSize[] = ['S', 'M', 'L'];
const SIZE_WORD: Record<TileSize, string> = { S: t('tilesSizeS'), M: t('tilesSizeM'), L: t('tilesSizeL') };
/** Each unit this editor can set for one tile: its row title and its two choices [value, short label, spoken label]. */
const UNIT: Record<UnitKey, { label: MessageKey; ch: readonly (readonly [string, string, MessageKey])[] }> = {
  weight: { label: 'teUWeight', ch: [['lb', 'lb', 'teLb'], ['kg', 'kg', 'teKg']] },
  energy: { label: 'teUEnergy', ch: [['kcal', 'kcal', 'teKcal'], ['kJ', 'kJ', 'teKj']] },
  water: { label: 'teUWater', ch: [['floz', 'fl oz', 'teFloz'], ['ml', 'mL', 'teMl']] },
  distance: { label: 'teUDistance', ch: [['mi', 'mi', 'teMi'], ['km', 'km', 'teKm']] },
  height: { label: 'teULength', ch: [['ftin', 'ft, in', 'teFtin'], ['cm', 'cm', 'teCm']] },
  clock: { label: 'teUTime', ch: [['12', '1:30 PM', 'te12'], ['24', '13:30', 'te24']] },
};
const SWATCH_NAME: Record<(typeof SWATCHES)[number], MessageKey> = {
  accent: 'teSwAccent', 'accent-2': 'teSwAccent2', training: 'teSwTraining', food: 'teSwFood', recovery: 'teSwRecovery', sleep: 'teSwSleep', water: 'teSwWater',
};
const copy = (o: TileOptionValues) => ({ ...o });
const words = (a: string[]) => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')}${t('teAnd')}${a[a.length - 1]}`;

/**
 * Edit tile: one large sheet for every tile on every page. A live preview of the tile at its real proportions (swipe it,
 * or tap a style, and the old design slides out as the next comes in), then its style, size, what it shows, its own units,
 * its goal and its colour. Every change shows on the page underneath straight away; Revert puts the tile and its goals back
 * as they were when the sheet opened, Reset tile returns it to how it starts, Remove sends it back to the tray.
 */
export function TileEditorSheet({ page, id, storage }: { page: unknown; id: unknown; storage?: TileStorage | null }) {
  const { colors, mode } = useTheme();
  const close = useCallback(() => tileRoutes().close(), []);
  if (!isTilePage(page)) return <NoTile colors={colors} mode={mode} close={close} />;
  return <Editor page={page} id={typeof id === 'string' ? id : ''} storage={storage} close={close} />;
}

function NoTile({ colors, mode, close }: { colors: ThemeColors; mode: ThemeMode; close: () => void }) {
  return <View style={[s.root, { backgroundColor: sheetBg(colors, mode) }]}>
    <View style={s.pad}><SheetHeader title={t('teTitle')} left={t('tilesDone')} onLeft={close} colors={colors} mode={mode} /></View>
    <EmptyBlock title={t('tilesNoTileTitle')} body={t('tilesNoTileBody')} colors={colors} />
  </View>;
}

/** Where a tile starts: its place in the page's starting layout, or its own defaults. */
function startOf(cfg: TilePageConfig, def: TileDef): Pick0 {
  const d = cfg.defaults.find(x => x[0] === def.id);
  const style = d?.[2] && stylesOf(def).some(v => v.key === d[2]) ? d[2] : defaultStyle(def);
  const size = d && sizesOf(def, style).includes(d[1]) ? d[1] : firstSize(def, style);
  return { style, size, options: optionValues(def, style, d?.[3]) };
}

function Editor({ page, id, storage, close }: { page: TilePageId; id: string; storage?: TileStorage | null; close: () => void }) {
  const { colors, mode, reduceMotion: rm } = useTheme();
  const insets = useSafeAreaInsets();
  const { store, state, cfg } = useTileStore(page, storage);
  const repo = useTileRepository();
  const [prefs, setPref] = useSettingsPrefs();
  // An id that is not on the page opens the page's first tile, as the grid's customize did.
  const entry = state.tiles.find(e => e.id === id) ?? state.tiles[0] ?? null;
  const def = entry ? cfg.tiles.find(d => d.id === entry.id) ?? null : null;
  // Closing the sheet (Done, a swipe down or Remove) takes the outline off the tile.
  useEffect(() => () => { if (tileEdit.get().customizing) tileEdit.customize(page, null); }, [page]);
  const [goalRev, bump] = useState(0);
  const [change, setChange] = useState<{ c: Change; seq: number }>({ c: null, seq: 0 });
  const units = def ? TILE_UNITS[`${page}:${def.id}`] ?? [] : [], goalKeys = def ? TILE_GOALS[`${page}:${def.id}`] ?? [] : [];
  const ctx = useMemo<GoalCtx>(() => ({ repo, prefs, set: setPref, units: { ...prefs.units, ...(tileUnits(entry?.options) ?? {}) } }),
    [repo, prefs, setPref, entry?.options]); // eslint-disable-line react-hooks/exhaustive-deps
  // What the tile and its goals were when the sheet opened, for Revert.
  const [was] = useState(() => entry ? { pick: { style: entry.style, size: entry.size, options: copy(entry.options) } as Pick0,
    goals: Object.fromEntries(goalKeys.map(g => [g, safeGet(g, ctx)])) as Partial<Record<GoalKey, number>> } : null);
  const [headH, setHeadH] = useState(60);
  const [stageBottom, setStageBottom] = useState(400);
  const mini = useSharedValue(0);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const miniStyle = useAnimatedStyleSafe(mini);

  if (!entry || !def || !was) return <NoTile colors={colors} mode={mode} close={close} />;
  const home = cfg.variant === 'home';
  const styles = stylesOf(def), ok = sizesOf(def, entry.style), opts = optionsOf(def, entry.style);
  const cur = optionValues(def, entry.style, entry.options);
  const own = ownToken(cfg, def), tintKey = isSwatch(entry.options[TINT_KEY]) ? entry.options[TINT_KEY] : '';
  const tint = colors[(tintKey || own) as keyof ThemeColors] as string ?? colors.accent;
  const start = startOf(cfg, def);
  const idx = Math.max(0, styles.findIndex(v => v.key === entry.style));
  void goalRev;

  const apply = (next: Pick0, c: Change) => {
    store.customize(entry.id, { style: next.style, size: next.size, options: next.options });
    setChange(x => ({ c, seq: x.seq + 1 }));
  };
  const setStyle = (key: string, dir?: 1 | -1) => {
    if (key === entry.style) return;
    const to = styles.findIndex(v => v.key === key), ok2 = sizesOf(def, key);
    const size = ok2.includes(entry.size) ? entry.size : home ? (ok2.includes('M') ? 'M' : ok2[0]) : firstSize(def, key);
    apply({ ...entry, style: key, size }, { how: 'slide', dir: dir ?? (to > idx ? 1 : -1) });
  };
  const step = (d: 1 | -1) => { const v = styles[idx + d]; if (v) setStyle(v.key, d); };
  const setSize = (z: TileSize) => { if (ok.includes(z) && z !== entry.size) apply({ ...entry, size: z }, { how: 'size' }); };
  const setOption = (oid: string, v: string) => apply({ ...entry, options: { ...entry.options, [oid]: v } }, { how: 'fade' });
  const setUnit = (u: UnitKey, v: string) => {
    const o = copy(entry.options);
    if (v === prefs.units[u]) delete o[`u.${u}`]; else o[`u.${u}`] = v;
    apply({ ...entry, options: o }, { how: 'fade' });
  };
  const setTint = (c: string) => {
    const o = copy(entry.options);
    if (c && c !== own) o[TINT_KEY] = c; else delete o[TINT_KEY];
    apply({ ...entry, options: o }, { how: 'fade' });
  };
  const setGoal = (g: GoalKey, dir: 1 | -1) => {
    const spec = GOALS[g], v = safeGet(g, ctx), n = stepGoal(spec, ctx, dir);
    if (n === v) return;
    try { spec.set(ctx, n); } catch { /* left as last saved */ }
    bump(x => x + 1); setChange(x => ({ c: { how: 'fade' }, seq: x.seq + 1 }));
  };
  const dirty = entry.style !== was.pick.style || entry.size !== was.pick.size || !sameOptions(entry.options, was.pick.options)
    || goalKeys.some(g => safeGet(g, ctx) !== was.goals[g]);
  const atStart = entry.style === start.style && entry.size === start.size && sameOptions(entry.options, start.options);
  const revert = () => {
    for (const g of goalKeys) { const v = was.goals[g]; if (v != null && safeGet(g, ctx) !== v) { try { GOALS[g].set(ctx, v); } catch { /* kept */ } } }
    bump(x => x + 1);
    apply({ style: was.pick.style, size: was.pick.size, options: copy(was.pick.options) }, { how: 'fade' });
    showToast(t('teReverted'), { color: toastColor(def.color) });
  };
  const reset = () => apply({ style: start.style, size: start.size, options: copy(start.options) }, { how: 'fade' });
  const remove = () => { const rid = entry.id; close(); setTimeout(() => store.remove(rid), rm ? 0 : 260); };

  // Once the preview scrolls away, a small copy of it stays pinned under the header.
  const onScroll = (y: number) => {
    const on = y + headH + 24 > stageBottom ? 1 : 0;
    if (on !== mini.value) mini.value = rm ? on : withTiming(on, { duration: 240, easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
  };

  const dark = mode === 'dark';
  const card = dark ? { backgroundColor: colors['surface-2'] } : { backgroundColor: colors.surface, boxShadow: `0 0 0 1px ${colors.hair}` };
  const on = dark ? { backgroundColor: colorMix(tint, 0.18, colors['surface-2']), boxShadow: `inset 0 0 0 1.5px ${tint}` }
    : { backgroundColor: colorMix(tint, 0.16, colors.surface), boxShadow: `inset 0 0 0 1.5px ${tint}` };
  const segBg = dark ? colors.bg : colorMix(colors.text, 0.07, colors.bg);
  const segOn = dark
    ? { backgroundColor: colorMix(colors.text, 0.14, colors.surface), boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }
    : { backgroundColor: colors.surface, boxShadow: `0 1px 3px ${rgba(colors.text, 0.18)}` };
  const seg = (label: string, items: { v: string; short: string; spoken: string }[], value: string, onPick: (v: string) => void) =>
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[s.seg, { backgroundColor: segBg }]}>
      {items.map(c => { const sel = c.v === value; return <Tappable dim={sel ? 'none' : 'seg'} key={c.v} accessibilityRole="radio" accessibilityState={{ selected: sel }}
        accessibilityLabel={c.spoken} onPress={() => { if (!sel) onPick(c.v); }} style={[s.segBtn, sel && segOn]}>
        <Text numberOfLines={1} style={[s.segT, { color: sel ? colors.text : colors['text-muted'] }]}>{c.short}</Text>
      </Tappable>; })}
    </View>;
  const head = (title: string, aside?: string) => <View style={s.h}>
    <Text accessibilityRole="header" style={[s.hT, { color: colors['text-muted'] }]}>{title}</Text>
    {aside ? <Text style={[s.hA, { color: colors['text-muted'] }]}>{aside}</Text> : null}
  </View>;
  const row = (key: string, title: string, sub: ReactNode, right: ReactNode, i: number) => <View key={key} style={[s.row, i > 0 && { boxShadow: `inset 0 1px 0 ${colors.hair}` }]}>
    <View style={s.rowL}><Text style={[s.rowT, { color: colors.text }]}>{title}</Text>{sub ? <Text style={[s.rowS, { color: colors['text-muted'] }]}>{sub}</Text> : null}</View>
    {right}
  </View>;

  const sw = SWATCHES.filter(c => c !== own);
  const tintName = tintKey ? t(SWATCH_NAME[tintKey as (typeof SWATCHES)[number]]) : t('teTileColour');
  const f = FRAMES[entry.size] ?? FRAMES.M, mk = Math.min(96 / f.h, 210 / f.w);

  return <View style={[s.root, { backgroundColor: sheetBg(colors, mode) }]}>
    <ScrollView ref={scrollRef} style={s.root} contentContainerStyle={[s.pad, { paddingBottom: 40 + insets.bottom }]} stickyHeaderIndices={[0]}
      scrollEventThrottle={16} onScroll={e => onScroll(e.nativeEvent.contentOffset.y)}>
      <View onLayout={(e: LayoutChangeEvent) => setHeadH(e.nativeEvent.layout.height)}>
        <EditorHeader dirty={dirty} onDone={close} onRevert={revert} colors={colors} mode={mode} />
      </View>
      <View>
        <View style={s.id}>
          <View style={[s.ic, { backgroundColor: rgba(tint, 0.15) }]}><TileIcon name={def.icon} size={17} color={tint} /></View>
          <View style={s.idT}>
            <Text numberOfLines={1} style={[s.idB, { color: colors.text }]}>{def.title}</Text>
            {def.sub ? <Text numberOfLines={2} style={[s.idS, { color: colors['text-muted'] }]}>{def.sub}</Text> : null}
          </View>
        </View>
        <TileStage cfg={cfg} def={def} pick={entry} styles={styles} change={change.c} seq={change.seq} colors={colors} mode={mode} rm={rm} tint={tint}
          onStep={step} onLayoutBottom={y => setStageBottom(y + headH)} />

        {styles.length > 1 ? <>
          {head(t('tilesStyle'), fill(t('teStyles'), { n: styles.length }))}
          <StyleChips styles={styles} value={entry.style} onPick={k => setStyle(k)} colors={colors} card={card} on={on} tint={tint} rm={rm} />
        </> : null}

        {head(t('tilesSize'))}
        <View style={s.szs} accessibilityRole="radiogroup" accessibilityLabel={t('tilesSize')}>
          {SIZES.map(z => { const can = ok.includes(z), sel = z === entry.size; return <Tappable dim={sel || !can ? 'none' : 'fill'} key={z} disabled={!can}
            accessibilityRole="radio" accessibilityState={{ selected: sel, disabled: !can }} accessibilityLabel={can ? SIZE_WORD[z] : fill(t('teSizeOff'), { size: SIZE_WORD[z] })}
            onPress={() => setSize(z)} style={[s.sz, card, sel && on, !can && { opacity: 0.38 }]}>
            <SizeGlyph size={z} on={sel ? tint : rgba(sel ? colors.text : colors['text-muted'], 0.9)} color={sel ? colors.text : colors['text-muted']} />
            <Text style={[s.szT, { color: sel ? colors.text : colors['text-muted'] }]}>{SIZE_WORD[z]}</Text>
          </Tappable>; })}
        </View>
        {ok.length < 3 ? <Text style={[s.note, { color: colors['text-muted'] }]}>{fill(t('teComesIn'), { style: styles[idx]?.name || t('teThisStyle'), sizes: words(ok.map(z => SIZE_WORD[z])) })}</Text> : null}

        {opts.length ? <>
          {head(t('teShows'))}
          <View style={[s.card, card]}>{opts.map((op, i) => row(op.id, op.label, null,
            seg(op.label, op.choices.map(c => ({ v: String(c[0]), short: c[2] ?? c[1], spoken: c[1] })), String(cur[op.id]), v => setOption(op.id, v)), i))}</View>
        </> : null}

        {units.length ? <>
          {head(t('teUnits'), t('teThisTile'))}
          <View style={[s.card, card]}>{units.map((u, i) => {
            const U = UNIT[u], app = prefs.units[u] as string, mine = entry.options[`u.${u}`], v = mine ?? app, mineOn = mine != null && mine !== app;
            const appName = (U.ch.find(c => c[0] === app) ?? U.ch[0])[1];
            const sub = mineOn ? <>{fill(t('teSettingsUses'), { u: appName })}<Text accessibilityRole="button" onPress={() => setUnit(u, app)} suppressHighlighting
              style={[s.useSet, { color: colors.accent }]}>{t('teUseSettings')}</Text></> : t('teSame');
            return row(u, t(U.label), sub, seg(t(U.label), U.ch.map(c => ({ v: c[0], short: c[1], spoken: t(c[2]) })), v, x => setUnit(u, x)), i);
          })}</View>
        </> : null}

        {goalKeys.length ? <>
          {head(t('teGoal'))}
          <View style={[s.card, card]}>{goalKeys.map((g, i) => {
            const spec = GOALS[g], v = safeGet(g, ctx), lo = v <= spec.min(ctx), hi = v >= spec.max(ctx), name = spec.label.toLowerCase();
            return row(g, spec.label, spec.where, <View style={[s.gs, { backgroundColor: segBg }]}>
              <GoalButton glyph="minus" off={lo} label={fill(t('teLower'), { goal: name })} onPress={() => setGoal(g, -1)} colors={colors} />
              <Text accessibilityLiveRegion="polite" style={[s.gsV, { color: colors.text }]}>{spec.show(ctx, v)}</Text>
              <GoalButton glyph="plus" off={hi} label={fill(t('teRaise'), { goal: name })} onPress={() => setGoal(g, 1)} colors={colors} />
            </View>, i);
          })}</View>
        </> : null}

        {canTint(cfg, def) ? <>
          {head(t('teColour'))}
          <View style={[s.card, card]}>
            <View style={s.sw} accessibilityRole="radiogroup" accessibilityLabel={t('teColour')}>
              <Swatch k={colors[own] as string} half={colorMix(colors[own] as string, 0.55, colors.surface)} sel={!tintKey} label={t('teTileColour')} onPress={() => setTint('')} colors={colors} />
              {sw.map(c => <Swatch key={c} k={colors[c] as string} sel={tintKey === c} label={t(SWATCH_NAME[c])} onPress={() => setTint(c)} colors={colors} />)}
            </View>
            <View style={s.swl}>
              <Text style={[font(600, 13), { color: colors.text }]}>{tintName}</Text>
              <Text style={[font(500, 13), { color: colors['text-muted'] }]}>{t(tintKey ? 'teFollows' : 'teOwn')}</Text>
            </View>
          </View>
        </> : null}

        {def.editExtra ? <View style={s.extra}>{def.editExtra({ close })}</View> : null}

        <View style={s.act}>
          <Tappable dim={atStart ? 'none' : 'fill'} disabled={atStart} accessibilityRole="button" accessibilityState={{ disabled: atStart }} onPress={reset} style={[s.btn, card]}>
            <EdGlyph name="refresh" size={16} color={atStart ? colors.ghost : colors.text} />
            <Text style={[s.btnT, { color: atStart ? colors.ghost : colors.text }]}>{t('teReset')}</Text>
          </Tappable>
          <Tappable dim="fill" accessibilityRole="button" onPress={remove} style={[s.btn, card]}>
            <EdGlyph name="x" size={16} color={colors.danger} />
            <Text style={[s.btnT, { color: colors.danger }]}>{fill(t('tilesRemoveFrom'), { page: cfg.label })}</Text>
          </Tappable>
        </View>
      </View>
    </ScrollView>
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="te-mini"
      style={[s.mb, miniStyle, { top: headH, backgroundColor: sheetBg(colors, mode), boxShadow: `0 1px 0 ${colors.hair}` }]}>
      <View style={{ width: f.w * mk, height: f.h * mk, borderRadius: 14, overflow: 'hidden' }}>
        <View style={{ width: f.w, height: f.h, transform: [{ scale: mk }], transformOrigin: 'left top' }}>
          <TileFrame cfg={cfg} def={def} entry={entry} colors={colors} mode={mode} reduceMotion={rm} preview />
        </View>
      </View>
      <View style={s.mt}>
        <Text numberOfLines={1} style={[font(600, 15), { color: colors.text }]}>{styles[idx]?.name || def.title}</Text>
        <Text style={[font(500, 13), { marginTop: 2, color: colors['text-muted'] }]}>{SIZE_WORD[entry.size]}</Text>
      </View>
    </Animated.View>
  </View>;
}

const TOAST_COLORS = ['accent', 'food', 'water', 'recovery', 'training', 'sleep', 'success', 'warning'] as const;
const toastColor = (c: string) => (TOAST_COLORS as readonly string[]).includes(c) ? c as (typeof TOAST_COLORS)[number] : 'accent';
function safeGet(g: GoalKey, c: GoalCtx) { try { return GOALS[g].get(c); } catch { return 0; } }
function useAnimatedStyleSafe(v: { value: number }) {
  return useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * -6 }] }));
}

/** Done on the left, the title, and Revert on the right once something changed (it keeps its place while hidden). */
function EditorHeader({ dirty, onDone, onRevert, colors, mode }: { dirty: boolean; onDone: () => void; onRevert: () => void; colors: ThemeColors; mode: ThemeMode }) {
  const v = useSharedValue(dirty ? 1 : 0);
  useEffect(() => { v.value = withTiming(dirty ? 1 : 0, { duration: 200 }); }, [dirty, v]);
  const st = useAnimatedStyle(() => ({ opacity: v.value }));
  return <View style={[s.sh, { backgroundColor: sheetBg(colors, mode) }]}>
    <View style={s.side}><Pressable accessibilityRole="button" onPress={onDone} hitSlop={4} style={({ pressed }) => [s.shBtn, pressed && { opacity: 0.45 }]}>
      <Text style={[s.shL, { color: colors.accent }]}>{t('tilesDone')}</Text>
    </Pressable></View>
    <Text accessibilityRole="header" numberOfLines={1} style={[s.shT, { color: colors.text }]}>{t('teTitle')}</Text>
    <View style={[s.side, { alignItems: 'flex-end' }]}>
      <Animated.View style={st} pointerEvents={dirty ? 'auto' : 'none'}>
        <Pressable testID="te-revert" accessibilityRole="button" accessibilityElementsHidden={!dirty} importantForAccessibility={dirty ? 'auto' : 'no-hide-descendants'}
          onPress={onRevert} hitSlop={4} style={({ pressed }) => [s.shBtn, pressed && { opacity: 0.45 }]}>
          <Text style={[s.shL, { color: colors.accent }]}>{t('teRevert')}</Text>
        </Pressable>
      </Animated.View>
    </View>
  </View>;
}

function StyleChips({ styles, value, onPick, colors, card, on, tint, rm }: {
  styles: readonly { key: string; name: string; depth?: boolean }[]; value: string; onPick: (k: string) => void; colors: ThemeColors; card: object; on: object; tint: string; rm: boolean;
}) {
  const ref = useRef<ComponentRef<typeof ScrollView>>(null), xs = useRef<Record<string, { x: number; w: number }>>({}), [w, setW] = useState(0), first = useRef(true);
  useEffect(() => {
    const b = xs.current[value]; if (!b || !w) return;
    ref.current?.scrollTo({ x: Math.max(0, b.x - (w - b.w) / 2), animated: !first.current && !rm });
    first.current = false;
  }, [value, w, rm]);
  return <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} style={s.sts} contentContainerStyle={s.stsIn}
    onLayout={e => setW(e.nativeEvent.layout.width)} accessibilityRole="radiogroup" accessibilityLabel={t('tilesStyle')}>
    {styles.map((v, i) => { const sel = v.key === value, name = v.name || fill(t('tilesStyleN'), { n: i + 1 });
      return <Tappable dim={sel ? 'none' : 'fill'} key={v.key} accessibilityRole="radio" accessibilityState={{ selected: sel }} accessibilityLabel={`${name}${v.depth ? ', 3D' : ''}`}
        onLayout={e => { xs.current[v.key] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width }; }}
        onPress={() => onPick(v.key)} style={[s.st, card, sel && on]}>
        <Text style={[s.stT, { color: sel ? colors.text : colors['text-muted'] }]}>{name}</Text>
        {v.depth ? <Text style={[s.em, { color: tint, backgroundColor: rgba(tint, 0.16) }]}>3D</Text> : null}
      </Tappable>; })}
  </ScrollView>;
}

function GoalButton({ glyph, off, label, onPress, colors }: { glyph: 'minus' | 'plus'; off: boolean; label: string; onPress: () => void; colors: ThemeColors }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: off }} disabled={off} onPress={onPress}
    style={({ pressed }) => [s.gsB, pressed && { backgroundColor: colors['hair-2'] }]}>
    <EdGlyph name={glyph} size={17} color={off ? colors.ghost : colors.text} />
  </Pressable>;
}

function Swatch({ k, half, sel, label, onPress, colors }: { k: string; half?: string; sel: boolean; label: string; onPress: () => void; colors: ThemeColors }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ selected: sel }} accessibilityLabel={label} onPress={onPress} hitSlop={4}
    style={({ pressed }) => [s.swB, pressed && { opacity: 0.75 }]}>
    <View style={[s.swRing, { borderColor: sel ? k : 'transparent' }]} />
    <View style={[s.swC, { backgroundColor: k, boxShadow: `inset 0 0 0 1px ${rgba(colors.text, 0.12)}` }]}>
      {half ? <View style={[s.swHalf, { backgroundColor: half }]} /> : null}
      {sel ? <EdGlyph name="check" size={16} color={colors.bg} /> : null}
    </View>
  </Pressable>;
}

const s = StyleSheet.create({
  root: { flex: 1 },
  pad: { paddingHorizontal: 16 },
  sh: { flexDirection: 'row', alignItems: 'center', minHeight: 56 + GRABBER_ROOM, marginHorizontal: -16, marginBottom: 4, paddingTop: 4 + GRABBER_ROOM, paddingBottom: 4, paddingHorizontal: 8 },
  side: { flex: 1, minWidth: 80, alignItems: 'flex-start' },
  shBtn: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, justifyContent: 'center' },
  shL: { fontFamily: tokens.font.body, fontSize: 17, letterSpacing: -0.17 },
  shT: { fontFamily: tokens.font.heading, fontSize: 17, letterSpacing: -0.34, textAlign: 'center' },
  id: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 2, marginBottom: 12 },
  ic: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  idT: { flex: 1, minWidth: 0 },
  idB: { fontFamily: tokens.font.heading, fontSize: 17, lineHeight: 20.4, letterSpacing: -0.26 },
  idS: { marginTop: 2, ...font(500, 13, 1.3) },
  h: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginTop: 22, marginHorizontal: 4, marginBottom: 8 },
  hT: { ...font(700, 13, undefined, 0.06), ...capitals },
  hA: font(500, 13),
  card: { borderRadius: 20, paddingVertical: 4, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 56, paddingVertical: 8 },
  rowL: { flex: 1, minWidth: 0 },
  rowT: font(600, 15),
  rowS: { marginTop: 2, ...font(500, 12.5, 1.35) },
  useSet: font(600, 12.5),
  seg: { flexDirection: 'row', flexShrink: 0, gap: 2, padding: 2, borderRadius: 12 },
  segBtn: { minHeight: 32, minWidth: 52, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segT: font(600, 13),
  sts: { marginHorizontal: -16 },
  stsIn: { gap: 8, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 4 },
  st: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 15, borderRadius: 999 },
  stT: font(600, 14),
  em: { ...font(700, 10, undefined, 0.06), paddingVertical: 2, paddingHorizontal: 5, borderRadius: 5, overflow: 'hidden' },
  szs: { flexDirection: 'row', gap: 8 },
  sz: { flex: 1, alignItems: 'center', gap: 8, paddingTop: 14, paddingHorizontal: 6, paddingBottom: 11, borderRadius: 18 },
  szT: font(600, 13.5),
  note: { marginTop: 8, marginHorizontal: 6, ...font(500, 12.5, 1.4) },
  gs: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 999, padding: 3, flexShrink: 0 },
  gsB: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  gsV: { minWidth: 78, textAlign: 'center', ...font(700, 14.5), fontVariant: ['tabular-nums'] },
  sw: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, paddingTop: 14, paddingBottom: 12 },
  swB: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  swRing: { position: 'absolute', left: -5, top: -5, right: -5, bottom: -5, borderRadius: 22, borderWidth: 2 },
  swC: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  swHalf: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 17 },
  swl: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 12 },
  extra: { marginTop: 24 },
  act: { gap: 10, marginTop: 24 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', minHeight: 50, borderRadius: 16 },
  btnT: font(600, 15),
  mb: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 6, paddingHorizontal: 20, paddingBottom: 12 },
  mt: { flex: 1, minWidth: 0 },
});
