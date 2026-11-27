import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useAuth } from '@/auth/provider';
import { Icon } from '@/components/icon';
import { alpha, mix } from '@/components/kit-style';
import type { ThemeColors, ThemeMode } from '@/design/tokens';
import type { TileRenderProps } from '@/features/tiles';
import { trainingNav } from '../workout/nav';
import { IconChip, K, LiveDot, Material, S, T, TileButton, useTrainingData } from '../workout/tiles/parts';
import { tr } from '../workout/tr';
import { frequency, timesPerWeek, weeklySets, type WeekCell } from './model';
import { SPLIT_PRESETS, dayKinds, type SplitPreset } from './presets';
import { splitMenu, startSplitDay, statusLine } from './menu';
import { SplitStore, type SplitView } from './store';

/** The split store and today's view, read again whenever the repository changes or the minute turns. */
export function useSplit(): { store: SplitStore; view: SplitView | null } | null {
  const { repository } = useAuth(), data = useTrainingData();
  // `data` is new with every repository revision and minute, and its clock is the one the view reads, so the React
  // Compiler (which memoizes on what the body reads) recomputes the view whenever the data or the minute changes.
  const now = data?.now;
  return useMemo(() => {
    if (!repository) return null;
    const store = new SplitStore(repository);
    return { store, view: store.view(now == null ? new Date() : new Date(now)) };
  }, [repository, now]);
}

/** "Each muscle 2× a week" for a preset, from its days' sets. */
export function presetFrequency(store: SplitStore, p: SplitPreset) {
  const days = p.days.map(d => d.ex.map(([name, sets]) => ({ name, sets })));
  return frequency(weeklySets(days, timesPerWeek({ mode: 'rotate', perWeek: p.perWeek, week: [...p.week] }, p.days.length), store.muscles));
}
export const scheduleLine = (v: Pick<SplitView, 'def'>) => v.def.mode === 'rotate'
  ? tr('splitSchedRotate', { n: v.def.perWeek }) : tr('splitSchedWeekdays', { n: v.def.week.filter(w => w >= 0).length });

/** The Split tile (Insight Mockup v21): a one-time picker until a split is chosen, then today's day and the week. */
export function SplitTile(p: TileRenderProps) {
  const split = useSplit(), chosen = !!split?.view, { preview } = p;
  useEffect(() => { if (!preview) chosenNow = chosen; }, [chosen, preview]);
  if (!split) return null;
  return split.view ? <Tracker {...p} store={split.store} v={split.view} /> : <Picker {...p} store={split.store} />;
}

/** Whether the tile on the page shows a split, for what a tap on the tile opens (the picker's cards take their own taps). */
let chosenNow = false;
export function openSplit() { if (chosenNow) trainingNav.plan(); }

/* ---------- the first-time picker ---------- */
// The cards and the Change pill sink a touch while held, and stay still with Reduce Motion.
const CARD_W = 250, CARD_H = 184, CARD_GAP = 10, CARD_PRESS_SCALE = 0.98, PILL_PRESS_SCALE = 0.95;
function Picker(p: TileRenderProps & { store: SplitStore }) {
  const { colors, mode, size, body, editing, preview, store, reduceMotion } = p, tint = colors.training;
  const [page, setPage] = useState(0);
  const live = !editing && !preview, sink = live && !reduceMotion;
  if (size !== 'L') {
    // S and M have no room for the cards: the lead and one button that opens every split.
    return <View style={{ flex: 1 }}>
      <View style={{ flexDirection: size === 'M' ? 'row' : 'column', alignItems: size === 'M' ? 'center' : 'flex-start', gap: size === 'M' ? 12 : 10 }}>
        <IconChip name="sp-split" color={tint} size={size === 'M' ? 40 : 34} icon={size === 'M' ? 20 : 18} radius={12} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w={700} s={size === 'M' ? 19 : 16} lh={1.15} tr={-0.02} c={colors.text} lines={2}>{tr('splitChooseTitle')}</T>
          {size === 'M' ? <S colors={colors} lines={2} style={{ marginTop: 3 }}>{tr('splitChooseShortLead')}</S> : null}
        </View>
      </View>
      {size === 'S' ? <S colors={colors} lines={2} style={{ marginTop: 6 }}>{tr('splitChooseShortLead')}</S> : null}
      <View style={{ marginTop: 'auto' }}>
        <TileButton label={tr('splitChooseButton')} icon="sp-split" small w={body.w} tint={tint} colors={colors} mode={mode} a11y={tr('splitChooseASplit')}
          onPress={live ? () => trainingNav.splitLibrary() : undefined} />
      </View>
    </View>;
  }
  const count = SPLIT_PRESETS.length + 1;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const i = contentOffset.x + layoutMeasurement.width >= contentSize.width - 4 ? count - 1 : Math.round(contentOffset.x / (CARD_W + CARD_GAP));
    if (i !== page) setPage(Math.max(0, Math.min(count - 1, i)));
  };
  return <View style={{ flex: 1 }} testID="split-picker">
    <T w={700} s={19} lh={1.15} tr={-0.02} c={colors.text} style={{ marginTop: 0 }}>{tr('splitChooseTitle')}</T>
    <S colors={colors} lines={2} style={{ marginTop: 3, lineHeight: 16.25 }}>{tr('splitChooseLead')}</S>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={CARD_W + CARD_GAP} decelerationRate="fast" disableIntervalMomentum
      scrollEnabled={live} onScroll={onScroll} scrollEventThrottle={32} accessibilityRole="list"
      style={{ marginTop: 12, marginHorizontal: -16, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 2, paddingBottom: 10, gap: CARD_GAP }}>
      {SPLIT_PRESETS.map(preset => <PresetCard key={preset.key} preset={preset} store={store} colors={colors} mode={mode} live={live} sink={sink} />)}
      <Pressable accessibilityRole="button" accessibilityLabel={`${tr('splitBuildOwn')}. ${tr('splitBuildOwnBody')}`} disabled={!live} onPress={() => trainingNav.splitNew()}
        testID="split-build-own"
        style={({ pressed }) => ({ width: CARD_W, height: CARD_H, borderRadius: 18, borderWidth: 1.5, borderColor: alpha(tint, 0.45), padding: 14, paddingBottom: 12,
          justifyContent: 'center', alignItems: 'flex-start', transform: [{ scale: pressed && sink ? CARD_PRESS_SCALE : 1 }] })}>
        <IconChip name="plus" color={tint} size={40} icon={20} radius={13} />
        <T w={700} s={17} lh={1.15} tr={-0.02} c={colors.text} style={{ marginTop: 12 }}>{tr('splitBuildOwn')}</T>
        <S colors={colors} size={12} lines={3} style={{ marginTop: 6 }}>{tr('splitBuildOwnBody')}</S>
      </Pressable>
    </ScrollView>
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 'auto' }} accessible accessibilityLabel={tr('splitPageOf', { n: page + 1, total: count })}>
      {Array.from({ length: count }, (_, i) => <View key={i} style={{ width: i === page ? 18 : 6, height: 6, borderRadius: 3,
        backgroundColor: i === page ? tint : alpha(colors.text, 0.18) }} />)}
    </View>
  </View>;
}

function PresetCard({ preset, store, colors, mode, live, sink }: { preset: SplitPreset; store: SplitStore; colors: ThemeColors; mode: ThemeMode; live: boolean; sink: boolean }) {
  const tint = colors.training, freq = presetFrequency(store, preset) === 2 ? tr('splitFreq2') : tr('splitFreq1');
  const days = tr(preset.days.length === 1 ? 'splitDays_one' : 'splitDays_other', { n: preset.days.length });
  return <Pressable accessibilityRole="button" disabled={!live} onPress={() => trainingNav.splitSetup(preset.key)} testID={`split-card-${preset.key}`}
    accessibilityLabel={tr('splitPresetLabel', { name: preset.name, days, freq: tr('splitNAWeek', { n: preset.perWeek }), blurb: preset.blurb })}
    style={({ pressed }) => ({ width: CARD_W, height: CARD_H, transform: [{ scale: pressed && sink ? CARD_PRESS_SCALE : 1 }] })}>
    <Material kind="plate" mode={mode} colors={colors} radius={18} w={CARD_W} h={CARD_H}>
      <View style={{ flex: 1, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T w={700} s={17} lh={1.15} tr={-0.02} c={colors.text} style={{ flex: 1, minWidth: 0 }}>{preset.name}</T>
          <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 999, justifyContent: 'center', backgroundColor: alpha(tint, 0.14) }}>
            <T w={700} s={11} lh={1} c={tint}>{preset.level}</T>
          </View>
        </View>
        <S colors={colors} size={12} lines={2} style={{ marginTop: 6 }}>{preset.blurb}</S>
        <View style={{ marginTop: 'auto', minWidth: 0 }}>
          <T w={700} s={12} lh={1.2} c={mix(tint, colors.text, 0.8)} style={{ marginBottom: 8 }}>{dayKinds(preset.days).join(' · ')}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {Array.from({ length: preset.perWeek }, (_, i) => <Material key={i} kind="fill" fill={tint} mode={mode} colors={colors} radius={13} w={26} h={26}>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><T w={700} s={10} lh={1} c={colors['on-accent']} num>{i + 1}</T></View>
            </Material>)}
            <T w={600} s={11.5} c={colors['text-muted']} style={{ marginLeft: 3 }}>{tr('splitAWeek')}</T>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
          <T w={600} s={11.5} c={colors['text-muted']}>{freq}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <T w={700} s={11.5} c={tint}>{tr('splitChooseButton')}</T>
            <Icon name="chevron-right" size={14} color={tint} />
          </View>
        </View>
      </View>
    </Material>
  </Pressable>;
}

/* ---------- the tracker ---------- */
function Tracker(p: TileRenderProps & { store: SplitStore; v: SplitView }) {
  const { colors, mode, size, body, v, editing, preview, reduceMotion } = p, tint = colors.training;
  const live = !editing && !preview, t = v.now, name = (i: number) => v.days[i]?.name ?? '';
  const menu = live ? () => splitMenu(p.store.repo, reduceMotion) : undefined;
  // The head: the split's name and how it runs, and the minimal Change pill.
  const change = <Pressable accessibilityRole="button" accessibilityLabel={tr('splitChangeLabel')} onPress={menu} testID="split-change" hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
    style={({ pressed }) => ({ transform: [{ scale: pressed && !reduceMotion ? PILL_PRESS_SCALE : 1 }] })}>
    <Material kind="plate" mode={mode} colors={colors} radius={999} w={size === 'S' ? 30 : 88} h={30}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingLeft: size === 'S' ? 0 : 9, paddingRight: size === 'S' ? 0 : 11 }}>
        <Icon name="swap" size={15} color={tint} />
        {size === 'S' ? null : <T w={700} s={12.5} c={colors.text}>{tr('splitChange')}</T>}
      </View>
    </Material>
  </Pressable>;
  const head = size === 'S'
    ? <View style={{ height: 30, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <S colors={colors} size={11.5} style={{ flex: 1 }}>{v.def.name}</S>{change}
    </View>
    : <View style={{ height: 34, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <IconChip name="sp-split" color={tint} size={30} icon={17} radius={10} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w={700} s={14.5} lh={1.15} tr={-0.01} c={colors.text}>{v.def.name}</T>
        <S colors={colors} size={11.5} style={{ marginTop: 1 }}>{scheduleLine(v)}</S>
      </View>
      {change}
    </View>;

  // The focus: today's day, or (done, skipped or rest) the next session.
  const focusDay = t.kind === 'live' ? (t.focus >= 0 ? v.days[t.focus] : null) : v.days[t.focus] ?? null;
  const dayName = t.kind === 'live' ? (v.live?.name || name(t.focus) || tr('splitFreestyle')) : focusDay?.name ?? tr('splitRest');
  const muscles = focusDay?.focus ?? [];
  const kicker = t.kind === 'live' ? <LiveDot label={tr('splitInProgress')} colors={colors} />
    : t.kind === 'planned' ? <K colors={colors} color={tint} track={0.12}>{(v.def.mode === 'rotate' ? tr('splitUpNext') : tr('splitToday')) + (t.carried ? tr('splitCarried') : '')}</K>
      : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {t.kind === 'done' ? <Icon name="check" size={12} color={tint} /> : null}
        <K colors={colors} color={t.kind === 'done' ? tint : undefined} track={0.12}>{statusLine(v)}</K>
      </View>;
  let right = null;
  if (t.kind === 'live' && v.live) {
    const sets = liveSets(p.store, v.live.id);
    right = <View style={{ alignItems: 'flex-end' }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <T w={700} s={22} lh={1} tr={-0.02} c={colors.text} num>{String(sets.done)}</T>
        <T w={600} s={12} c={colors['text-muted']} style={{ marginLeft: 2 }}>{tr('trainingOf', { total: sets.total })}</T>
      </View>
      <S colors={colors} size={11.5} style={{ marginTop: 3 }}>{tr('trainingUnitSets')}</S>
    </View>;
  } else if (t.kind === 'planned' && focusDay) {
    right = <TileButton label={size === 'S' ? '' : tr('splitStart')} icon="play" small={size === 'S'} w={size === 'S' ? 40 : 92} tint={tint} colors={colors} mode={mode}
      a11y={tr('splitStartName', { name: focusDay.name })} onPress={live ? () => startSplitDay(p.store.repo, focusDay.routineId) : undefined} />;
  }
  const focus = size === 'S'
    ? <View style={{ marginTop: 8, minWidth: 0 }}>
      {kicker}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
        <T w={700} s={21} lh={1.05} tr={-0.03} c={colors.text} style={{ flex: 1, minWidth: 0 }}>{dayName}</T>
      </View>
      <S colors={colors} style={{ marginTop: 3 }}>{muscles.join(', ')}</S>
    </View>
    : <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: size === 'L' ? 14 : 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {kicker}
        <T w={700} s={size === 'M' ? 22 : 26} lh={1.05} tr={-0.03} c={colors.text} style={{ marginTop: size === 'M' ? 5 : 7 }}>{dayName}</T>
        {size === 'M' ? <S colors={colors} style={{ marginTop: 3 }}>{muscles.join(' · ')}</S> : <MuscleChips muscles={muscles} colors={colors} />}
      </View>
      {right}
    </View>;

  const thenList = size === 'L' ? thenNames(v) : [];
  const then = thenList.length ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, minWidth: 0 }}>
    <View style={{ opacity: 0.6 }}><Icon name="chevron-right" size={12} color={colors['text-muted']} /></View>
    <T w={500} s={12} c={colors['text-muted']} style={{ flex: 1 }}>{tr('splitThen') + ' '}
      {thenList.map((n, i) => <T key={i} w={600} s={12} c={colors.text}>{(i ? ' · ' : '') + n}</T>)}</T>
  </View> : null;

  return <View style={{ flex: 1, minWidth: 0 }} testID="split-tracker">
    {head}
    {focus}
    {then}
    {size === 'L' ? <View style={{ height: 14 }} /> : null}
    <WeekStrip v={v} size={size} w={body.w} colors={colors} mode={mode} />
  </View>;
}

function liveSets(store: SplitStore, sessionId: string) {
  let done = 0, total = 0;
  for (const e of store.workout.entries(sessionId)) for (const d of store.workout.drafts(e.id)) {
    if (d.warmup || d.tag === 'warmup') continue;
    total++; if (d.setId) done++;
  }
  return { done, total };
}
/** The next few split days after the one front and centre. */
function thenNames(v: SplitView) { return v.now.then.slice(0, 3).map(i => v.days[i]?.name ?? '').filter(Boolean); }

function MuscleChips({ muscles, colors }: { muscles: readonly string[]; colors: ThemeColors }) {
  const tint = colors.training;
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 9, maxHeight: 23, overflow: 'hidden' }}>
    {muscles.slice(0, 6).map(m => <View key={m} style={{ height: 23, paddingHorizontal: 9, borderRadius: 999, justifyContent: 'center', backgroundColor: alpha(tint, 0.13) }}>
      <T w={600} s={11.5} lh={1} c={mix(tint, colors.text, 0.7)}>{m}</T>
    </View>)}
  </View>;
}

/** This week: sessions in order against the target (Rotate in order) or Monday to Sunday (Set weekdays). */
function WeekStrip({ v, size, w, colors, mode }: { v: SplitView; size: TileRenderProps['size']; w: number; colors: ThemeColors; mode: ThemeMode }) {
  const tint = colors.training, big = size === 'L', rotate = v.def.mode === 'rotate', cells = v.week.cells;
  const letters = tr('splitWeekdayShort').split(',').map(x => x.charAt(0));
  const cols = rotate ? Math.max(cells.length, big ? 5 : 7) : 7, gap = 4, colW = (w - gap * (cols - 1)) / cols;
  const px = big ? 32 : size === 'M' ? 24 : 18;
  const done = Math.min(v.week.done, v.week.target);
  const label = rotate ? tr('splitWeekLabel', { done, target: v.week.target }) : cells.map(c => cellLabel(c)).join(', ');
  return <View style={{ marginTop: 'auto' }}>
    {big ? <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
      <K colors={colors}>{tr('splitThisWeek')}</K>
      <S colors={colors}><T w={600} s={12.5} c={colors.text} num>{String(done)}</T>{tr(rotate ? 'splitOfSessions' : 'splitOfSplitDays', { n: v.week.target })}</S>
    </View> : null}
    <View accessible accessibilityRole="image" accessibilityLabel={label} testID="split-week"
      style={{ flexDirection: 'row', gap, marginTop: big ? 10 : 0 }}>
      {cells.map((c, i) => {
        const now = c.now || c.kind === 'live';
        const top = rotate ? String(i + 1) : letters[c.n] ?? '';
        return <View key={i} style={{ width: colW, alignItems: 'center', gap: 5 }}>
          {big ? <T w={700} s={10.5} lh={1} c={now ? tint : colors['text-muted']} num>{top}</T> : null}
          <Circle cell={c} px={px} big={big} rotate={rotate} inner={big ? '' : rotate ? String(i + 1) : letters[c.n] ?? ''} now={now} colors={colors} mode={mode} />
          {big ? <T w={600} s={9.5} lh={1.1} c={now ? colors.text : colors['text-muted']} style={{ maxWidth: colW }}>{c.kind === 'rest' ? '' : shortName(c.name)}</T> : null}
        </View>;
      })}
    </View>
  </View>;
}
const shortName = (n: string) => n.replace(/^Push day /, 'Push ');
function cellLabel(c: WeekCell) {
  const key = c.kind === 'done' ? 'splitCellDone' : c.kind === 'live' ? 'splitCellLive' : c.kind === 'skip' ? 'splitCellSkip' : c.kind === 'plan' ? 'splitCellPlan' : 'splitCellRest';
  const day = tr('splitWeekdayLong').split(',')[c.n] ?? '';
  return `${day} ${tr(key, { name: c.name })}`;
}
function Circle({ cell, px, big, rotate, inner, now, colors, mode }: { cell: WeekCell; px: number; big: boolean; rotate: boolean; inner: string; now: boolean; colors: ThemeColors; mode: ThemeMode }) {
  const tint = colors.training, r = px / 2;
  if (cell.kind === 'done') return <Material kind="fill" fill={tint} mode={mode} colors={colors} radius={r} w={px} h={px}>
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={big ? 16 : 11} color={colors['on-accent']} /></View>
  </Material>;
  if (!big) {
    const ring = now ? tint : cell.kind === 'rest' ? 'transparent' : colors['hair-2'];
    const ink = now ? tint : cell.kind === 'rest' ? alpha(colors['text-muted'], 0.6) : colors['text-muted'];
    return <View style={{ width: px, height: px, borderRadius: r, borderWidth: 1.5, borderColor: ring, alignItems: 'center', justifyContent: 'center' }}>
      <T w={700} s={10} lh={1} c={ink} num style={cell.kind === 'skip' ? { textDecorationLine: 'line-through' } : undefined}>{inner}</T>
    </View>;
  }
  if (cell.kind === 'rest') return <View style={{ width: px, height: px, alignItems: 'center', justifyContent: 'center' }}>
    <Material kind="well" mode={mode} colors={colors} radius={px * 0.21} w={px * 0.42} h={px * 0.42} />
  </View>;
  if (cell.kind === 'skip') return <Material kind="well" mode={mode} colors={colors} radius={r} w={px} h={px}>
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Icon name="sp-skip" size={14} color={colors['text-muted']} /></View>
  </Material>;
  if (cell.kind === 'live') return <View style={{ width: px, height: px, borderRadius: r, borderWidth: 2, borderColor: tint, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tint }} />
  </View>;
  return <View style={{ width: px, height: px, borderRadius: r, borderWidth: 2, borderColor: alpha(tint, 0.7), alignItems: 'center', justifyContent: 'center' }}>
    {now || !rotate ? <Icon name="play" size={13} color={tint} /> : null}
  </View>;
}
