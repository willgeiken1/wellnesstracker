import { useMemo, useState } from 'react';
import { ScrollView, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { BarChart, EmptyState, Card, Icon, KitText, List, ListRow, NavBar, NavButton, SectionHeader, SegmentedControl, Tappable, alpha, useKit } from '@/components/kit';
import { capitals } from '@/components/kit-style';
import { showToast } from '@/features/shell/toast';
import { t } from '@/i18n/en';
import { fill } from '../tiles/ui';
import {
  addDays, count, currentPause, daysLabel, h12, hist, monthDay, nextItem, rById, rItems, shortDate, stats, win, win12,
  type DayState,
} from './model';
import { routinesRoutes } from './nav';
import { ItemList, ItemRow, OffRow } from './rows';
import { SunPath, Thumb } from './sun-path';
import { useRoutines, type RoutinesStore } from './store';

/** A pushed screen's frame: the page colour, the kit's nav bar, a 16 pt gutter. */
function Page({ children, bar, testID }: { children: React.ReactNode; bar: React.ReactNode; testID?: string }) {
  const k = useKit(), insets = useSafeAreaInsets();
  return <View testID={testID} style={{ flex: 1, backgroundColor: k.c.bg }}>
    <View style={{ paddingHorizontal: 16 }}>{bar}</View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 + insets.bottom }}>{children}</ScrollView>
  </View>;
}
/** The big title and line under it (`.rt-big`, `.rt-bsub`). */
function BigTitle({ title, sub }: { title: string; sub: string }) {
  return <>
    <KitText weight={700} size={32} lineHeight={1.1} tracking={-0.035} accessibilityRole="header" style={{ marginTop: 6, marginBottom: 2 }}>{title}</KitText>
    <KitText weight={500} size={14} color="text-muted" style={{ marginBottom: 18 }}>{sub}</KitText>
  </>;
}
/** Three stats in a row (`.rt-stats`). */
function Stats3({ items, top = 6 }: { items: [string, string, string][]; top?: number }) {
  return <View style={{ flexDirection: 'row', gap: 8, paddingTop: top, paddingHorizontal: 8 }}>
    {items.map(([label, v, small]) => <View key={label} style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${label} ${v} ${small}`}>
      <KitText weight={700} size={11} tracking={0.1} color="text-muted" style={capitals}>{label}</KitText>
      <KitText weight={700} size={22} tracking={-0.03} numeric>{v}<KitText weight={600} size={12.5} tracking={0} color="text-muted">{` ${small}`}</KitText></KitText>
    </View>)}
  </View>;
}

/** Routine detail: its window on the sun path, today's items with check-off, and its settings. */
export function RoutineDetail({ store, rid }: { store: RoutinesStore; rid: string }) {
  const k = useKit(), { s, n } = useRoutines(store), [w, setW] = useState(0);
  const r = rById(s, rid) ?? s.routines[0];
  if (!r) return <Page bar={<NavBar back={t('routinesTitle')} />}><EmptyState icon="routines" color="sleep" title={t('routinesGone')} /></Page>;
  const color = k.c[r.color], items = rItems(s, r.id, n), all = rItems(s, r.id, n, true), off = all.filter(i => !items.includes(i)), cn = count(s, r.id, n);
  const st = stats(s, all, n), nx = nextItem(s, n), pause = currentPause(r, n.day);
  return <Page testID="routine-detail" bar={<NavBar back={t('routinesTitle')} right={<NavButton label={t('routinesEdit')} onPress={() => routinesRoutes.reorder()} />} />}>
    <BigTitle title={r.name} sub={`${win12(r)} · ${daysLabel(r.days)} · ${fill(t('routinesNItemsCount'), { n: all.length })}`} />
    <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ backgroundColor: k.c.surface, borderRadius: 24, paddingTop: 12, paddingHorizontal: 10, paddingBottom: 14, boxShadow: k.cardEdge }}>
      {w ? <SunPath s={s} n={n} only={r.id} width={w - 20} small big={pause ? t('routinesPaused') : fill(t('routinesNOfM'), { n: cn.done, m: cn.n })} label={fill(t('routinesWindowLabel'), { name: r.name, win: win(r) })} /> : null}
      <Stats3 items={[[t('routinesToday'), String(cn.done), `/ ${cn.n}`], [t('routines30Days'), String(st.pct), '%'], [t('routinesStreak'), String(st.streak), t('routinesDays')]]} />
    </View>
    {pause ? <PauseCard text={<><KitText weight={700} size={14}>{fill(t('routinesPausedUntilDot'), { date: shortDate(pause.until) })}</KitText>{` ${t('routinesPausedStreak')}`}</>} style={{ marginTop: 12 }} /> : null}
    <SectionHeader title={t('routinesToday')} aside={t('routinesHistory')} onAside={() => routinesRoutes.history(r.id)} />
    {items.length || off.length ? <ItemList color={color}>
      {items.map((i, j) => <ItemRow key={i.id} i={i} s={s} n={n} store={store} next={nx?.id === i.id} color={color} first={j === 0} />)}
      {off.map((i, j) => <OffRow key={i.id} i={i} first={!items.length && j === 0} />)}
    </ItemList> : <Card><EmptyState icon="routines" color="sleep" title={fill(t('routinesNothingIn'), { name: r.name })} description={t('routinesNothingInBody')} /></Card>}
    <SectionHeader title={t('routinesSettings')} />
    <List>
      <ListRow icon="plus" color="sleep" title={fill(t('routinesAddItemTo'), { name: r.name })} onPress={() => routinesRoutes.add({ routine: r.id })} />
      <ListRow icon="bell" color="sleep" title={t('routinesRemindMe')} sub={fill(t('routinesRemindSub'), { time: h12(r.from) })} toggle={r.remind}
        onToggle={on => { store.setRemind(r.id, on); showToast(fill(t(on ? 'routinesRemindOn' : 'routinesRemindOff'), { name: r.name }), { color: 'sleep' }); }} />
      {pause ? <ListRow icon="pause" color="sleep" title={fill(t('routinesResumeName'), { name: r.name })} sub={fill(t('routinesPausedUntil'), { date: shortDate(pause.until) })} chevron={false}
        onPress={() => { store.resume(r.id); showToast(fill(t('routinesBackOn'), { name: r.name }), { color: 'sleep' }); }} />
        : <ListRow icon="pause" color="sleep" title={t('routinesPauseFor')} sub={t('routinesUntilPick')} onPress={() => routinesRoutes.pause(r.id)} />}
      <ListRow icon="history" color="sleep" title={t('routinesHistory')} sub={t('routinesHistorySub')} onPress={() => routinesRoutes.history(r.id)} />
    </List>
  </Page>;
}

/** The paused note (`.rt-pcard`): a pause icon in a soft square and a line. */
export function PauseCard({ text, style, sheet }: { text: React.ReactNode; style?: object; sheet?: boolean }) {
  const k = useKit();
  return <View style={[{ backgroundColor: sheet ? (k.dark ? k.c.bg : k.c.surface) : k.c.surface, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', gap: 12, alignItems: 'center', boxShadow: k.cardEdge }, style]}>
    <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(k.c.sleep, 0.16) }}><Icon name="pause" size={18} color={k.c.sleep} /></View>
    <KitText weight={500} size={14} lineHeight={1.4} style={{ flex: 1 }}>{text}</KitText>
  </View>;
}

/* ---------- Edit routines ---------- */

const ROW_H = 68, ROW_GAP = 8;
/** Edit routines: drag the grip to reorder, Edit opens a routine, + New routine, and hidden routines to restore. */
export function RoutinesReorder({ store }: { store: RoutinesStore }) {
  const k = useKit(), { s, n } = useRoutines(store);
  const [drag, setDrag] = useState<{ id: string; dy: number } | null>(null);
  const order = s.routines.map(r => r.id);
  const moveTo = (id: string, to: number) => {
    const from = order.indexOf(id), next = order.slice(); next.splice(from, 1); next.splice(Math.max(0, Math.min(order.length - 1, to)), 0, id);
    if (next.join() !== order.join()) store.reorder(next);
    return next;
  };
  const say = (ids: string[]) => showToast(fill(t('routinesOrderSaved'), { names: ids.map(id => rById(store.read(), id)?.name ?? '').join(', ') }), { color: 'sleep' });
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <Page testID="routines-reorder" bar={<NavBar back={t('routinesTitle')} right={<NavButton label={t('routinesDoneBtn')} onPress={() => router.back()} />} />}>
      <BigTitle title={t('routinesEditRoutines')} sub={t('routinesDragSub')} />
      <View style={{ gap: ROW_GAP }}>
        {s.routines.map((r, idx) => {
          const cnt = rItems(s, r.id, n, true).length, dragging = drag?.id === r.id;
          // While one row is dragged, the rows it passes shift a place to make room.
          const at = drag ? order.indexOf(drag.id) : -1, over = drag ? Math.max(0, Math.min(order.length - 1, at + Math.round(drag.dy / (ROW_H + ROW_GAP)))) : -1;
          const shift = !drag || dragging ? 0 : at < idx && idx <= over ? -(ROW_H + ROW_GAP) : over <= idx && idx < at ? ROW_H + ROW_GAP : 0;
          const pan = Gesture.Pan().runOnJS(true).activateAfterLongPress(0).minDistance(2)
            .onStart(() => { setDrag({ id: r.id, dy: 0 }); Haptics.selectionAsync().catch(() => {}); })
            .onUpdate(e => setDrag({ id: r.id, dy: e.translationY }))
            .onEnd(e => { const ids = moveTo(r.id, idx + Math.round(e.translationY / (ROW_H + ROW_GAP))); setDrag(null); say(ids); })
            .onFinalize(() => setDrag(null));
          const paused = !!currentPause(r, n.day);
          return <View key={r.id} style={{ height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: k.c.surface, borderRadius: 18, paddingVertical: 8, paddingRight: 12, paddingLeft: 4,
            boxShadow: dragging ? k.lift : k.cardEdge, zIndex: dragging ? 3 : 0, transform: [{ translateY: dragging ? drag!.dy : shift }, { scale: dragging ? 1.02 : 1 }] }}>
            <GestureDetector gesture={pan}>
              <View accessible accessibilityRole="adjustable" accessibilityLabel={fill(t('routinesReorderLabel'), { name: r.name })}
                accessibilityActions={[{ name: 'increment', label: t('routinesMoveDown') }, { name: 'decrement', label: t('routinesMoveUp') }]}
                onAccessibilityAction={e => { const ids = moveTo(r.id, idx + (e.nativeEvent.actionName === 'increment' ? 1 : -1)); showToast(fill(t('routinesMovedTo'), { name: r.name, n: ids.indexOf(r.id) + 1 }), { color: 'sleep' }); }}
                style={{ width: 44, height: 52, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="rt-grip" size={20} color={k.c['text-muted']} />
              </View>
            </GestureDetector>
            <Thumb from={r.from} to={r.to} color={k.c[r.color]} />
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <KitText weight={600} size={16} numberOfLines={1}>{r.name}</KitText>
              <KitText weight={500} size={12.5} color="text-muted" numberOfLines={1}>{win12(r)}</KitText>
              <KitText weight={500} size={12.5} color="text-muted" numberOfLines={1}>{`${daysLabel(r.days)} · ${cnt} ${cnt === 1 ? t('routinesItem') : t('routinesItems')}${paused ? ` · ${t('routinesPaused')}` : ''}`}</KitText>
            </View>
            <ActPill label={t('routinesEdit')} spoken={fill(t('routinesEditName'), { name: r.name })} onPress={() => routinesRoutes.detail(r.id)} />
          </View>;
        })}
      </View>
      <Tappable dim="row" accessibilityRole="button" accessibilityLabel={t('routinesNewRoutine')} onPress={() => routinesRoutes.newRoutine()}
        style={{ minHeight: 52, borderWidth: 1.5, borderStyle: 'dashed', borderColor: k.c['hair-2'], borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
        <KitText weight={600} size={15} color="text-muted">{t('routinesPlusNewRoutine')}</KitText>
      </Tappable>
      {s.hidden.length ? <>
        <KitText weight={700} size={11.5} tracking={0.12} color="text-muted" style={[capitals, { marginTop: 22, marginBottom: 8, marginHorizontal: 6 }]}>{t('routinesHidden')}</KitText>
        <View style={{ gap: ROW_GAP }}>{s.hidden.map(r => <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: k.c['hair-2'], borderRadius: 18, paddingVertical: 8, paddingLeft: 14, paddingRight: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <KitText weight={600} size={16} numberOfLines={1}>{r.name}</KitText>
            <KitText weight={500} size={12.5} color="text-muted" numberOfLines={1}>{r.sub}</KitText>
          </View>
          <ActPill on label={t('routinesRestore')} onPress={() => { const undo = store.restore(r.id); showToast(fill(t('routinesIsBack'), { name: r.name }), { color: 'sleep', action: { label: t('routinesUndo'), onAction: undo } }); }} />
        </View>)}</View>
      </> : null}
    </Page>
  </GestureHandlerRootView>;
}
function ActPill({ label, spoken, onPress, on }: { label: string; spoken?: string; onPress: () => void; on?: boolean }) {
  const k = useKit();
  return <Tappable dim="row" accessibilityRole="button" accessibilityLabel={spoken ?? label} onPress={onPress} hitSlop={{ top: 5, bottom: 5, left: 2, right: 2 }}
    style={{ minHeight: 34, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1.5, borderColor: on ? k.c.text : k.c['hair-2'], justifyContent: 'center' }}>
    <KitText weight={600} size={13} color={on ? 'text' : 'text-muted'}>{label}</KitText>
  </Tappable>;
}

/* ---------- History ---------- */

const STATE_WORD: Record<DayState, 'routinesStDone' | 'routinesStSkipped' | 'routinesStMissed' | 'routinesStOff' | 'routinesStLater'> = {
  d: 'routinesStDone', s: 'routinesStSkipped', m: 'routinesStMissed', o: 'routinesStOff', u: 'routinesStLater',
};
/** History: the last 30 days for all routines or one, a day by day chart, then each item's own 30 days. */
export function RoutineHistory({ store, initial }: { store: RoutinesStore; initial: string }) {
  const k = useKit(), { s, n } = useRoutines(store);
  const [which, setWhich] = useState(initial === 'all' || rById(s, initial) ? initial : 'all');
  const [sel, setSel] = useState<{ key: string; text: string } | null>(null);
  const items = useMemo(() => s.items.filter(i => i.routines.length && (which === 'all' || i.routines.includes(which))).sort((a, b) => a.h - b.h), [s, which]);
  const st = stats(s, items, n), pcts = st.days.map(x => (x.s ? Math.round((x.d / x.s) * 100) : 0));
  const first = addDays(n.day, -29), mid = addDays(n.day, -14);
  return <Page testID="routine-history" bar={<NavBar back={t('routinesTitle')} title={t('routinesHistory')} />}>
    <View style={{ marginTop: 8, marginBottom: 14 }}>
      <SegmentedControl label={t('routinesRoutineWord')} value={which} onChange={v => { setWhich(v); setSel(null); }}
        options={[{ value: 'all', label: t('routinesAll') }, ...s.routines.map(r => ({ value: r.id, label: r.name }))]} />
    </View>
    <View style={{ backgroundColor: k.c.surface, borderRadius: 24, paddingTop: 12, paddingHorizontal: 10, paddingBottom: 14, boxShadow: k.cardEdge }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 8 }}>
        <KitText weight={700} size={11.5} tracking={0.14} color="sleep" style={capitals}>{t('routinesLast30')}</KitText>
        <KitText weight={600} size={12.5} numeric color="text-muted">{fill(t('routinesRange'), { a: monthDay(first), b: monthDay(n.day) })}</KitText>
      </View>
      <Stats3 top={8} items={[[t('routinesDone'), String(st.pct), '%'], [t('routinesLoggedWord'), String(st.done), fill(t('routinesOfN'), { n: st.sched })], [t('routinesStreak'), String(st.streak), t('routinesDays')]]} />
      <View style={{ paddingTop: 12, paddingHorizontal: 8 }}>
        <BarChart values={pcts} color="sleep" h={70} label={t('routinesBarsLabel')} labels={pcts.map((_, j) => (j === 0 ? monthDay(first) : j === 15 ? monthDay(mid) : j === 29 ? t('routinesToday') : ''))} />
      </View>
    </View>
    <SectionHeader title={t('routinesByItem')} aside={fill(t('routinesNItemsCount'), { n: items.length })} />
    <View accessibilityLiveRegion="polite" style={{ minHeight: 40, marginTop: 2, marginBottom: 10, marginHorizontal: 6, justifyContent: 'center' }}>
      {sel ? <KitText weight={600} size={13.5}>{sel.text}</KitText> : <KitText weight={500} size={13.5} color="text-muted">{t('routinesTapADay')}</KitText>}
    </View>
    <View style={{ gap: 8 }}>{items.map(i => {
      const hs = hist(s, i, n), sch = hs.filter(x => x !== 'o' && x !== 'u').length, dn = hs.filter(x => x === 'd').length, r = rById(s, i.routines[0]), color = k.c[r?.color ?? 'sleep'];
      return <View key={i.id} style={{ backgroundColor: k.c.surface, borderRadius: 18, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14, boxShadow: k.cardEdge }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <KitText weight={600} size={15.5} numberOfLines={1} style={{ flexShrink: 1 }}>{i.name}<KitText weight={500} size={13} color="text-muted">{`  ${i.dose} · ${h12(i.h)}`}</KitText></KitText>
          <KitText weight={700} size={15} numeric>{sch ? `${Math.round((dn / sch) * 100)}%` : t('routinesNew')}</KitText>
        </View>
        <View style={{ flexDirection: 'row', gap: 2, marginTop: 8 }}>{hs.map((x, d) => {
          const day = addDays(n.day, d - 29), key = `${i.id}${d}`, word = t(STATE_WORD[x]), on = sel?.key === key;
          const look = x === 'd' ? { backgroundColor: color } : x === 's' ? { borderWidth: 1.3, borderColor: k.c['text-muted'] }
            : x === 'o' ? { borderBottomWidth: 1.5, borderBottomColor: k.c['hair-2'], borderRadius: 0 } : { backgroundColor: k.c['surface-2'] };
          return <Tappable key={d} dim="none" accessibilityRole="button" accessibilityLabel={`${shortDate(day)}, ${word}`} hitSlop={{ top: 14, bottom: 14 }}
            onPress={() => setSel({ key, text: `${i.name}, ${shortDate(day)}: ${word}` })}
            style={[{ flex: 1, height: 16, borderRadius: 3 }, look, d === 29 || on ? { outlineWidth: on ? 2 : 1.5, outlineColor: on ? k.c.accent : k.c.text, outlineOffset: 1, outlineStyle: 'solid' } : null]} />;
        })}</View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <KitText weight={600} size={11} color="text-muted">{monthDay(first)}</KitText><KitText weight={600} size={11} color="text-muted">{t('routinesToday')}</KitText>
        </View>
      </View>;
    })}</View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, columnGap: 14, marginTop: 12, marginHorizontal: 6 }}>
      {([['d', 'routinesStDone'], ['s', 'routinesStSkipped'], ['m', 'routinesMissedOrLater'], ['o', 'routinesStOff']] as const).map(([x, key]) => <View key={x} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={[{ width: 11, height: 11, borderRadius: 3, marginRight: 6 }, x === 'd' ? { backgroundColor: k.c.sleep } : x === 's' ? { borderWidth: 1.3, borderColor: k.c['text-muted'] } : x === 'm' ? { backgroundColor: k.c['surface-2'] } : { borderBottomWidth: 1.5, borderBottomColor: k.c['hair-2'], borderRadius: 0 }]} />
        <KitText weight={600} size={12} color="text-muted">{t(key)}</KitText>
      </View>)}
    </View>
  </Page>;
}

