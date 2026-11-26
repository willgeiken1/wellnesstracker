import { useEffect, useRef, useSyncExternalStore, type ComponentRef } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useIsFocused } from 'expo-router';
import { Button, Card, EmptyState, Icon, IconButton, KitText, List, ListRow, PageHeader, StackGapContext, Tappable, mix, useKit, useSelectionHaptic, type IconName } from '@/components/kit';
import { capitals } from '@/components/kit-style';
import type { Repository } from '@/data/repository';
import { pageEndSpace } from '@/features/shell/geometry';
import { useQuickActions, useShellEditMode } from '@/features/shell/registry';
import { TileGrid, tileEdit, useTileEdit } from '@/features/tiles';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { fill } from '../tiles/ui';
import { toggleDone } from './actions';
import {
  addDays, byType, count, daysLeft, daysWord, fmt, h12, isDone, markOf, nextItem, peptides, routineOf, supplies, weekdayOf,
  type Item, type Now, type RoutinesState,
} from './model';
import { routinesRoutes, routinesTab, type RoutinesTab } from './nav';
import { routinesStoreFor, useRoutines } from './store';

const TABS: readonly RoutinesTab[] = ['routines', 'supplements', 'peptides', 'medications', 'other'];
const TAB_LABEL: Record<RoutinesTab, 'routinesTabRoutines' | 'routinesTabSupplements' | 'routinesTabPeptides' | 'routinesTabMedications' | 'routinesTabOther'> = {
  routines: 'routinesTabRoutines', supplements: 'routinesTabSupplements', peptides: 'routinesTabPeptides', medications: 'routinesTabMedications', other: 'routinesTabOther',
};
const useTab = () => useSyncExternalStore(routinesTab.subscribe, routinesTab.get, routinesTab.get);

const longDate = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

/**
 * The Routines tab: the date and title with History and Add item, the text tabs (Routines, Supplements, Peptides,
 * Medications, Other), then the page of Routines tiles or the list for the picked tab.
 */
export function RoutinesTabPage({ repo }: { repo: Repository }) {
  const k = useKit(), insets = useSafeAreaInsets(), scrollRef = useAnimatedRef<Animated.ScrollView>();
  const focused = useIsFocused(), store = routinesStoreFor(repo), { s, n } = useRoutines(store), tab = useTab();
  const { editing } = useTileEdit('routines');
  useShellEditMode('routines', editing, () => tileEdit.end());
  useEffect(() => { if (!focused) tileEdit.set('routines', false); }, [focused]);
  const nx = nextItem(s, n);
  useQuickActions('routines', {
    add: { run: () => routinesRoutes.add() },
    due: { run: () => { if (nx) toggleDone(store, nx.id); else routinesRoutes.history(); }, hint: nx ? `${nx.name}, ${h12(nx.h)}` : t('routinesAllDoneToday') },
    conv: { run: () => routinesRoutes.converter() },
    order: { run: () => routinesRoutes.reorder() },
    pause: { run: () => routinesRoutes.pause() },
    hist: { run: () => routinesRoutes.history() },
    tiles: { run: () => { routinesTab.set('routines'); tileEdit.set('routines', true); } },
  });
  const pick = (next: RoutinesTab) => { if (tileEdit.get()) tileEdit.set('routines', false); routinesTab.set(next); };
  const eyebrow = tab === 'routines' ? longDate(n.day) : subFor(s, tab);
  // The engine draws a tile's header text once; a new key when the counts or the next item change redraws it.
  const gridKey = `${n.day}|${s.routines.map(r => `${r.id}${count(s, r.id, n).done}`).join(',')}|${nx?.id ?? ''}|${Math.floor(n.h * 6)}`;
  return <Animated.ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: k.c.bg }} testID="routines-tab"
    contentContainerStyle={{ paddingTop: insets.top, paddingHorizontal: 16, paddingBottom: pageEndSpace(insets.bottom) }}>
    <StackGapContext.Provider value={0}>
      <PageHeader eyebrow={eyebrow} title={t('routinesTitle')}
        right={<>
          <IconButton icon="history" label={t('routinesHistoryLabel')} onPress={() => routinesRoutes.history()} />
          <IconButton icon="plus" label={t('routinesAddItem')} onPress={() => routinesRoutes.add()} />
        </>} />
    </StackGapContext.Provider>
    <TextTabs tab={tab} onPick={pick} />
    <View accessibilityRole="none">
      {tab === 'routines' ? <TileGrid key={gridKey} page="routines" scrollRef={scrollRef} />
        : tab === 'supplements' ? <Supplements s={s} n={n} />
          : tab === 'peptides' ? <Peptides s={s} n={n} />
            : tab === 'medications' ? <Medications s={s} n={n} />
              : <Other s={s} n={n} />}
    </View>
  </Animated.ScrollView>;
}

function subFor(s: RoutinesState, tab: RoutinesTab) {
  const nOf = (ty: Item['type']) => byType(s, ty).length;
  if (tab === 'supplements') return fill(t('routinesNSupplements'), { n: nOf('Supplement') });
  if (tab === 'peptides') return fill(t('routinesNPeptides'), { n: nOf('Peptide') });
  if (tab === 'medications') return nOf('Medication') ? fill(t('routinesNMedications'), { n: nOf('Medication') }) : t('routinesNoneYet');
  return fill(t('routinesNHabits'), { n: nOf('Other') + nOf('Enhancer') });
}

/** The text tabs (`.rt-tabs`): a scrolling row, the picked one in text colour with a 2 pt underline, fading at the right. */
function TextTabs({ tab, onPick }: { tab: RoutinesTab; onPick: (t: RoutinesTab) => void }) {
  const k = useKit(), haptic = useSelectionHaptic(), ref = useRef<ComponentRef<typeof ScrollView>>(null);
  return <View style={{ marginTop: -6, marginHorizontal: -16, marginBottom: 14, borderBottomWidth: 1, borderBottomColor: k.c.hair }}>
    <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel={t('routinesSections')}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 20 }}>
      {TABS.map(x => {
        const on = x === tab;
        return <Tappable key={x} dim="text" accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t(TAB_LABEL[x])}
          onPress={() => { if (!on) haptic(); onPick(x); }}
          style={{ minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: on ? k.c.text : 'transparent', marginBottom: -1 }}>
          <KitText weight={600} size={15} tracking={0.01} color={on ? 'text' : 'text-muted'}>{t(TAB_LABEL[x])}</KitText>
        </Tappable>;
      })}
    </ScrollView>
    <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: 0, bottom: 1, width: 48 }}>
      <Svg width="100%" height="100%"><Defs><LinearGradient id="rtfade" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor={k.c.bg} stopOpacity={0} /><Stop offset="1" stopColor={k.c.bg} stopOpacity={1} /></LinearGradient></Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#rtfade)" /></Svg>
    </View>
  </View>;
}

/** A tab's note under its list (`.rt-note`). */
function Note({ children }: { children: string }) {
  return <KitText weight={500} size={13} lineHeight={1.45} color="text-muted" style={{ marginTop: 12, marginHorizontal: 6 }}>{children}</KitText>;
}
/** The small supply bar at a row's right (`ui.bar` at 64 x 5). */
function MiniBar({ frac, color }: { frac: number; color: string }) {
  const k = useKit(), f = Math.max(0, Math.min(1, frac));
  return <View style={{ width: 64, height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: mix(color, k.c['surface-2'], 0.18) }}>
    <View style={{ width: `${f * 100}%`, height: '100%', borderRadius: 3, backgroundColor: color }} />
  </View>;
}

function Supplements({ s, n }: { s: RoutinesState; n: Now }) {
  const k = useKit(), list = byType(s, 'Supplement'), low = supplies(s).find(x => x.i.type === 'Supplement');
  return <View>
    {list.length ? <List>{list.map(i => {
      const r = routineOf(s, i), days = daysLeft(i), lw = days != null && days <= 10;
      const spoken = [i.name, i.dose, i.left != null ? `${fmt(i.left)} ${i.sup ?? ''} on hand` : '', days != null ? `about ${days} days left` : ''].filter(Boolean).join(', ');
      return <ListRow key={i.id} icon="rt-pill" color="sleep" title={i.name} sub={`${i.dose} · ${r ? `${r.name} ${h12(i.h)}` : t('routinesNoRoutine')}`} chevron={false}
        accessibilityLabel={spoken} onPress={() => routinesRoutes.detail(r?.id ?? s.routines[0]?.id ?? '')}
        right={days == null ? undefined : <View style={{ alignItems: 'flex-end', gap: 5, minWidth: 74 }}>
          <KitText weight={700} size={14} numeric color={lw ? 'warning' : 'text'}>{fill(t('routinesNDays'), { n: days })}</KitText>
          <MiniBar frac={days / 60} color={lw ? k.c.warning : k.c.sleep} />
        </View>} />;
    })}</List> : <Card><EmptyState icon="rt-pill" color="sleep" title={t('routinesNoSupplements')} description={t('routinesNoSupplementsBody')} /></Card>}
    <Note>{low ? `${t('routinesSupNote')} ${fill(t('routinesRunsOutIn'), { name: low.i.name, n: low.days })}` : t('routinesSupNote')}</Note>
    <View style={{ marginTop: 14 }}><Button full variant="secondary" color="sleep" icon="plus" label={t('routinesAddSupplement')} onPress={() => routinesRoutes.add({ type: 'Supplement' })} /></View>
  </View>;
}

function Tool({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const k = useKit();
  return <Tappable dim="row" accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 8, paddingVertical: 4, paddingHorizontal: 2 }}>
    <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, borderColor: k.c.sleep, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={24} color={k.c.sleep} /></View>
    <KitText weight={600} size={13} lineHeight={1.25} style={{ textAlign: 'center' }}>{label}</KitText>
  </Tappable>;
}

function Peptides({ s, n }: { s: RoutinesState; n: Now }) {
  const ps = peptides(s, n), sites = byType(s, 'Peptide').map(i => i.site).filter(Boolean);
  return <View>
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
      <Tool icon="rt-conv" label={t('routinesUnitConverter')} onPress={() => routinesRoutes.converter()} />
      <Tool icon="rt-target" label={t('routinesInjectionSites')} onPress={() => showSites(sites as string[])} />
      <Tool icon="plus" label={t('routinesAddPeptide')} onPress={() => routinesRoutes.add({ type: 'Peptide' })} />
    </View>
    <View style={{ gap: 12 }}>{ps.map(p => <VialCard key={p.i.id} p={p} s={s} n={n} />)}</View>
    <Note>{t('routinesPepNote')}</Note>
  </View>;
}
function showSites(sites: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { showToast } = require('@/features/shell/toast') as typeof import('@/features/shell/toast');
  showToast(sites.length ? fill(t('routinesSitesToast'), { sites: sites.join(' and ') }) : t('routinesNoSitesYet'), { color: 'sleep' });
}

/** A peptide's card (`.rt-gcard`): doses left in the vial as a ring, its routine and days, next dose and last site. */
function VialCard({ p, s, n }: { p: ReturnType<typeof peptides>[number]; s: RoutinesState; n: Now }) {
  const k = useKit(), i = p.i, r = p.r, vial = i.vial ?? 1, left = i.left ?? 0, C = 2 * Math.PI * 24, frac = Math.max(0, Math.min(1, left / vial));
  const done = isDone(s, n, i), monday = addDays(n.day, -((n.wd + 6) % 7));
  const next = i.days ? p.when.split(' ')[0] === 'Today' ? h12(i.h) : p.when.split(' ')[0] : done ? t('routinesTomorrow') : h12(i.h);
  const week = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, j) => {
    const day = addDays(monday, j), wd = weekdayOf(day), on = !i.days || i.days.includes(wd);
    return { d, y: on && (day !== n.day || done), today: day === n.day };
  });
  return <Tappable dim="row" accessibilityRole="button" onPress={() => r && routinesRoutes.detail(r.id)}
    accessibilityLabel={fill(t('routinesVialLabel'), { name: i.name, dose: i.dose, left, vial, next })}
    style={{ backgroundColor: k.c.surface, borderRadius: 22, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14, boxShadow: k.cardEdge }}>
    <Svg width={68} height={68} viewBox="0 0 64 64">
      <Circle cx={32} cy={32} r={24} strokeWidth={6} stroke={k.c['surface-2']} fill="none" />
      <Circle cx={32} cy={32} r={24} strokeWidth={6} strokeLinecap="round" stroke={k.c.sleep} fill="none" rotation={-90} origin="32, 32" strokeDasharray={`${(C * frac).toFixed(1)} ${C.toFixed(1)}`} />
      <SvgText x={32} y={34} fill={k.c.text} fontFamily={tokens.font.heading} fontSize={18} textAnchor="middle">{left}</SvgText>
      <SvgText x={32} y={46} fill={k.c['text-muted']} fontFamily={tokens.font.bodyStrong} fontSize={9} textAnchor="middle">{`of ${vial}`}</SvgText>
    </Svg>
    <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
      <KitText weight={700} size={10.5} tracking={0.12} color="sleep" numberOfLines={1} style={capitals}>{`${r?.name ?? t('routinesNoRoutine')} · ${i.days ? daysWord(i.days) : t('routinesDaily')} · ${h12(i.h)}`}</KitText>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: -2 }}>
        <KitText weight={700} size={19} tracking={-0.02} numberOfLines={1} style={{ flexShrink: 1 }}>{i.name}</KitText>
        <KitText weight={600} size={13} color="text-muted">{i.dose}</KitText>
      </View>
      <View style={{ flexDirection: 'row', gap: 3 }}>{week.map((w, j) => <View key={j} style={{ flex: 1, paddingVertical: 4, borderRadius: 6, alignItems: 'center',
        backgroundColor: w.y ? k.c.sleep : k.c['surface-2'], borderWidth: w.today ? 1.5 : 0, borderColor: k.c.text }}>
        <KitText weight={700} size={11} color={w.y ? 'on-accent' : 'text-muted'}>{w.d}</KitText>
      </View>)}</View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <KitText weight={500} size={12.5} color="text-muted">{t('routinesNext')} <KitText weight={600} size={12.5}>{next}</KitText></KitText>
        <KitText weight={500} size={12.5} color="text-muted">{t('routinesLastSite')} <KitText weight={600} size={12.5}>{i.site || t('routinesNoneYet')}</KitText></KitText>
      </View>
    </View>
  </Tappable>;
}

function Medications({ s, n }: { s: RoutinesState; n: Now }) {
  const list = byType(s, 'Medication');
  if (list.length) return <List>{list.map(i => {
    const r = routineOf(s, i), days = daysLeft(i);
    return <ListRow key={i.id} icon="rt-med" color="sleep" title={i.name} sub={`${i.dose} · ${r ? `${r.name} ${h12(i.h)}` : t('routinesNoRoutine')}`} chevron={false}
      value={days != null ? fill(t('routinesNDays'), { n: days }) : markOf(s, n.day, i.id) === 'd' ? t('routinesDone') : undefined}
      onPress={() => r && routinesRoutes.detail(r.id)} />;
  })}</List>;
  return <Card style={{ marginTop: 4 }}>
    <EmptyState icon="rt-med" color="sleep" title={t('routinesNoMeds')} description={t('routinesNoMedsBody')}
      action={{ label: t('routinesAddMed'), onPress: () => routinesRoutes.add({ type: 'Medication' }) }} />
  </Card>;
}

function Other({ s, n }: { s: RoutinesState; n: Now }) {
  const list = [...byType(s, 'Other'), ...byType(s, 'Enhancer')];
  return <View>
    <List>{list.map(i => {
      const r = routineOf(s, i), m = markOf(s, n.day, i.id);
      return <ListRow key={i.id} icon="rt-checkc" color={r ? r.color : 'sleep'} title={i.name} sub={`${i.dose} · ${r ? `${r.name}, ${h12(i.h)}` : t('routinesNoRoutine')}`}
        value={m === 'd' ? t('routinesDone') : m === 's' ? t('routinesSkipped') : h12(i.h)} chevron onPress={() => routinesRoutes.detail(r?.id ?? s.routines[0]?.id ?? '')} />;
    })}</List>
    <Note>{t('routinesOtherNote')}</Note>
  </View>;
}
