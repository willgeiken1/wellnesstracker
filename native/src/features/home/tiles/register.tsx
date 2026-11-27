import { router, type Href } from 'expo-router';
import { memo, useId, useMemo } from 'react';
import { Platform, Text, View } from 'react-native';
import { BarBackdrop } from '@/components/blur-bar';
import { tokens, type ThemeColors } from '@/design/tokens';
import { t } from '@/i18n/en';
import { TileIcon } from '@/features/tiles/tile-icon';
import { showToast } from '@/features/shell/toast';
import { implementTile, tilePage } from '@/features/tiles/registry';
import type { TileOptionValues, TileRenderProps } from '@/features/tiles/types';
import { SessionTile } from '@/features/workout/tiles/today';
import { EmptyTile } from './empty';
import { Markup } from './markup';
import { homeTileState, tileView, useHomeTileState } from './state';
import { drawTile } from './studio';
import { HIDDEN_TILES, numbersCover, useTileCovered } from '../hide-numbers';

/** Where the cover starts: under the tile's own header row. */
const COVER_TOP = 44;
/**
 * Hide numbers' cover over a weight or energy tile (pages/home.js `.hm-mask`): frosted glass with dots and Tap to show. The
 * figures under it are kept from VoiceOver; the tile itself says it is hidden, and a tap on it shows the numbers.
 * Where the system can't blur (Android) the glass is nearly solid, so no figure reads through.
 */
function NumbersCover({ colors, w, h }: { colors: ThemeColors; w: number; h: number }) {
  return <View pointerEvents="auto" testID="home-numbers-cover" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ position: 'absolute', left: 0, top: COVER_TOP, width: w, height: Math.max(0, h - COVER_TOP), borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
      overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
    <BarBackdrop color={colors.surface} amount={Platform.OS === 'ios' || Platform.OS === 'web' ? 0.62 : 0.94} blur={14} saturate={1.1} />
    <Text style={{ fontFamily: tokens.font.numeral, fontSize: 26, lineHeight: 26, color: colors.text }}>•••</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <TileIcon name="lock" size={14} color={colors['text-muted']} />
      <Text style={{ fontFamily: tokens.font.bodyStrong, fontSize: 13, color: colors['text-muted'] }}>{t('homeTapToShow')}</Text>
    </View>
  </View>;
}

const go = (href: string) => router.push(href as unknown as Href);

/** One Home tile in one style: drawn from Home's shared tile data, or its empty state. */
export const HomeTileView = memo(function HomeTileView(p: TileRenderProps) {
  const s = useHomeTileState();
  const uid = 'h' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const covered = useTileCovered(p.id);
  const def = tilePage('home').tiles.find(d => d.id === p.id);
  const key = JSON.stringify(p.options);
  const view = useMemo(() => s ? tileView(s, p.id, p.style, p.size, p.options) : null, [s, p.id, p.style, p.size, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const html = useMemo(() => s && view && 'options' in view
    ? drawTile({ id: p.id, style: p.style, size: p.size, options: view.options, colors: p.colors, mode: p.mode, data: s.data, units: s.units, uid })
    : null, [s, view, p.id, p.style, p.size, p.colors, p.mode, uid]);
  if (!html || !s) {
    return <EmptyTile icon={def?.icon ?? 'grid'} title={def?.title ?? ''} tint={p.tint} colors={p.colors}
      why={view && 'empty' in view ? view.empty : null} />;
  }
  // The drawing is laid out on the whole tile; the body box starts at the tile's 16 pt padding.
  return <View style={{ position: 'absolute', left: -16, top: -16, width: p.frame.w, height: p.frame.h }}>
    <View accessibilityElementsHidden={covered} importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'} style={{ width: p.frame.w, height: p.frame.h }}>
      <Markup html={html} colors={p.colors} mode={p.mode} reduceMotion={p.reduceMotion}
        onAction={p.editing || p.preview || covered ? undefined : s.onAction} />
    </View>
    {covered ? <NumbersCover colors={p.colors} w={p.frame.w} h={p.frame.h} /> : null}
  </View>;
});

const render = (p: TileRenderProps) => <HomeTileView {...p} />;

type Open = (options: TileOptionValues) => void;
// What a tap opens, as in the design: a tab, a pushed screen (a trend, Body, Sleep, Nutrition, the weekly report) or a sheet.
const OPEN: Record<string, { open: Open; label?: string }> = {
  score: { open: () => go('/score') },
  week: { open: () => go('/progress/weekly') },
  next: { open: () => go(homeTileState()?.data.next?.mode === 'workout' ? '/workout' : '/food/log'), label: 'Open what is next' },
  nextup: { open: () => go('/routines') },
  volume: { open: () => go('/workouts') },
  exercise: { open: () => go('/progress/trend?metric=training') },
  active: { open: () => go('/progress/trend?metric=kcal') },
  steps: { open: () => go('/progress/trend?metric=steps') },
  calories: { open: () => go('/food') },
  protein: { open: () => go('/food/nutrition') },
  water: { open: () => go('/food/water'), label: t('homeLogWater') },
  logMeal: { open: () => go('/food/log') },
  weight: { open: () => go('/progress/body') },
  bodyFat: { open: () => go('/progress/body') },
  sleep: { open: () => go('/progress/sleep') },
  sleepScore: { open: () => go('/progress/sleep') },
  mindful: { open: () => showToast(t('homeMindfulFromHealth'), { color: 'sleep' }), label: t('homeMindfulFromHealth') },
  hrv: { open: () => go('/progress/trend?metric=hrv') },
  rhr: { open: () => go('/progress/trend?metric=rhr') },
};

/** Puts every Home tile's renderer and tap in the tile catalogue. Safe to call more than once. */
let done = false;
export function registerHomeTiles() {
  if (done) return;
  done = true;
  // The Workout tile reads the workout store itself, so it shows the live workout or the next one to start in every state.
  implementTile('home', 'workout', { render: p => <SessionTile {...p} />,
    open: () => go(homeTileState()?.data.next.activeWorkout ? '/workout' : '/workouts') });
  for (const def of tilePage('home').tiles) {
    if (def.id === 'workout') continue;
    const o = OPEN[def.id];
    const styles = Object.fromEntries((def.versions ?? []).map(v => [v.key, { render }]));
    implementTile('home', def.id, { render, styles, ...(o ? { open: o.open, ...(o.label ? { label: o.label } : null) } : null),
      ...(HIDDEN_TILES.has(def.id) ? { cover: numbersCover(def.id) } : null) });
  }
}
