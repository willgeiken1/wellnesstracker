import { router, type Href } from 'expo-router';
import { memo, useId, useMemo } from 'react';
import { View } from 'react-native';
import { t } from '@/i18n/en';
import { showToast } from '@/features/shell/toast';
import { implementTile, tilePage } from '@/features/tiles/registry';
import type { TileOptionValues, TileRenderProps } from '@/features/tiles/types';
import { EmptyTile } from './empty';
import { Markup } from './markup';
import { homeTileState, tileView, useHomeTileState } from './state';
import { drawTile } from './studio';

const go = (href: string) => router.push(href as unknown as Href);

/** One Home tile in one style: drawn from Home's shared tile data, or its empty state. */
export const HomeTileView = memo(function HomeTileView(p: TileRenderProps) {
  const s = useHomeTileState();
  const uid = 'h' + useId().replace(/[^a-zA-Z0-9]/g, '');
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
    <Markup html={html} colors={p.colors} mode={p.mode} reduceMotion={p.reduceMotion}
      onAction={p.editing || p.preview ? undefined : s.onAction} />
  </View>;
});

const render = (p: TileRenderProps) => <HomeTileView {...p} />;

type Open = (options: TileOptionValues) => void;
const OPEN: Record<string, { open: Open; label?: string }> = {
  score: { open: () => go('/score') },
  week: { open: () => go('/insights') },
  next: { open: () => go(homeTileState()?.data.next?.mode === 'workout' ? '/workout' : '/food/log'), label: 'Open what is next' },
  nextup: { open: () => go('/routines') },
  volume: { open: () => go('/workouts') },
  exercise: { open: () => go('/insights') },
  active: { open: () => go('/insights') },
  steps: { open: () => go('/insights') },
  calories: { open: () => go('/food') },
  protein: { open: () => go('/food') },
  water: { open: () => showToast(t('homeWaterFromHealth'), { color: 'water' }), label: t('homeWaterFromHealth') },
  logMeal: { open: () => go('/food/log') },
  weight: { open: () => go('/progress') },
  bodyFat: { open: () => go('/progress') },
  sleep: { open: () => go('/insights') },
  sleepScore: { open: () => go('/insights') },
  mindful: { open: () => showToast(t('homeMindfulFromHealth'), { color: 'sleep' }), label: t('homeMindfulFromHealth') },
  hrv: { open: () => go('/insights') },
  rhr: { open: () => go('/insights') },
};

/** Puts every Home tile's renderer and tap in the tile catalogue. Safe to call more than once. */
let done = false;
export function registerHomeTiles() {
  if (done) return;
  done = true;
  for (const def of tilePage('home').tiles) {
    const o = OPEN[def.id];
    const styles = Object.fromEntries((def.versions ?? []).map(v => [v.key, { render }]));
    implementTile('home', def.id, { render, styles, ...(o ? { open: o.open, ...(o.label ? { label: o.label } : null) } : null) });
  }
}
