import { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { useSelectionHaptic } from '@/components/selection-haptic';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { touchTarget } from '@/components/button';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { loggedAmountText } from '@/features/routines/model/day';
import {
  ROUTINE_GRAPH_TABS, longRoutineDay, rememberGraphTab, routineGraphTab, routineHistoryCursor, routineHistoryView, routineMarkIcon, shortRoutineDay,
  type HistoryCell, type HistoryCursor, type HistoryDay, type HistoryView, type RoutineGraphTab,
} from '@/features/routines/model/history';
import { routineDayLetters } from '@/features/routines/model/types';
import { routinesText } from '@/i18n/en';
import { toolColor } from './colors';
import { Glyph, type GlyphName } from './glyph';
import { Note, Panel, RoundButton, semibold } from './parts';
import { useMinuteClock, useRoutines } from './use-routines';

type Mode = 'days' | 'calendar' | 'graph';
const MODES = [
  { value: 'days', label: routinesText('historyDays') }, { value: 'calendar', label: routinesText('historyCalendar') }, { value: 'graph', label: routinesText('historyGraph') },
] as const;
const GLYPH: Record<string, GlyphName | null> = { ring: 'ring', dash: 'dash', moon: 'moon', filled: 'check', none: null };
/** The tallest a graph bar is drawn. */
const BAR = 96;

/** The small drawing for a mark: a ring for missed, a dash for skipped, a moon for rest, a tick for logged. */
function Mark({ mark, size = 16 }: { mark: string; size?: number }) {
  const { colors } = useTheme();
  const glyph = GLYPH[routineMarkIcon(mark).icon];
  if (!glyph) return <View style={{ width: size, aspectRatio: 1 }} />;
  return <Glyph name={glyph} size={size} color={mark === 'logged' || mark === 'partial' ? colors.text : colors['text-muted']} width={2} />;
}

/** One day: its date, then each item with what happened to it and the amount stored on that log. */
function DayCard({ record }: { record: HistoryDay }) {
  const { colors } = useTheme();
  return <Panel testID={`history-day-${record.day}`} style={{ gap: 0 }}>
    <ThemedText variant="headline" accessibilityRole="header">{longRoutineDay(record.day)}</ThemedText>
    {record.rest && <View accessible style={{ minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1] }}>
      <Mark mark="rest" /><ThemedText style={{ flex: 1 }}>{routineMarkIcon('rest').label}</ThemedText>
    </View>}
    {record.items.map((row, index) => {
      const amount = loggedAmountText(row.log), label = routineMarkIcon(row.mark).label;
      return <View key={row.itemId || index} testID="history-item" accessible accessibilityLabel={[row.name, label, amount].filter(Boolean).join(', ')}
        style={{ minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], borderTopWidth: index || record.rest ? 1 : 0, borderTopColor: colors.hair }}>
        <Mark mark={row.mark} />
        <ThemedText style={{ flex: 1 }}>{row.name}</ThemedText>
        <ThemedText variant="caption" muted numeric>{[label, amount].filter(Boolean).join(' · ')}</ThemedText>
      </View>;
    })}
    {!record.rest && !record.items.some(row => row.mark !== 'open' && row.mark !== 'missed') && <Note testID="history-nothing">{routinesText('nothingLogged')}</Note>}
  </Panel>;
}

function MonthBar({ history, move }: { history: HistoryView; move: (delta: number) => void }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1] }}>
    <RoundButton testID="history-previous" glyph="back" label={routinesText('previousMonth')} onPress={() => move(-1)} />
    <ThemedText testID="history-month" variant="headline" accessibilityRole="header" accessibilityLiveRegion="polite" style={{ flex: 1, textAlign: 'center' }}>{history.monthLabel}</ThemedText>
    <RoundButton testID="history-next" glyph="forward" label={routinesText('nextMonth')} onPress={() => move(1)} disabled={!history.nextMonth} />
  </View>;
}

function Calendar({ history, pick }: { history: HistoryView; pick: (day: string) => void }) {
  const { colors } = useTheme();
  const weeks: HistoryCell[][] = [];
  history.cells.forEach((cell, index) => { if (index % 7 === 0) weeks.push([]); weeks[weeks.length - 1].push(cell); });
  const last = weeks[weeks.length - 1];
  while (last && last.length < 7) last.push({ kind: 'pad' });
  return <Panel testID="history-calendar" style={{ gap: tokens.spacing[0] }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row' }}>
      {routineDayLetters().map((letter, index) => <ThemedText key={index} variant="caption" muted style={[semibold, { flex: 1, textAlign: 'center' }]}>{letter}</ThemedText>)}
    </View>
    {weeks.map((week, row) => <View key={row} style={{ flexDirection: 'row' }}>
      {week.map((cell, column) => {
        if (cell.kind === 'pad') return <View key={column} style={{ flex: 1 }} />;
        const marks = cell.marks.map(mark => routineMarkIcon(mark).label).filter(Boolean);
        return <Tappable key={column} testID={`history-cell-${cell.day}`} accessibilityRole="button" disabled={cell.future}
          accessibilityLabel={[longRoutineDay(cell.day), cell.today ? routinesText('weekToday') : '', ...marks].filter(Boolean).join(', ')}
          accessibilityState={{ selected: cell.selected, disabled: cell.future }} onPress={() => pick(cell.day)}
          style={{ flex: 1, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 12, borderWidth: 1.5,
            borderColor: cell.selected ? colors.text : 'transparent', opacity: cell.future ? 0.4 : 1 }}>
          <ThemedText variant="caption" numeric style={cell.today ? semibold : undefined}>{Number(cell.day.slice(8))}</ThemedText>
          <View style={{ flexDirection: 'row', gap: 1 }}>{cell.marks.slice(0, 2).map(mark => <Mark key={mark} mark={mark} size={13} />)}</View>
        </Tappable>;
      })}
    </View>)}
  </Panel>;
}

function Graph({ history, pick, onTab }: { history: HistoryView; pick: (day: string) => void; onTab: (tab: RoutineGraphTab) => void }) {
  const { colors } = useTheme();
  const tone = toolColor(colors);
  const most = Math.max(1, ...history.graph.points.map(point => point.count));
  return <Panel testID="history-graph" style={{ gap: tokens.spacing[1] }}>
    <SegmentedControl label={routinesText('graphTabs')} options={ROUTINE_GRAPH_TABS.map(tab => ({ value: tab.id, label: tab.label }))} value={history.tab} onChange={onTab} />
    <ThemedText testID="history-graph-selected" numeric accessibilityLiveRegion="polite" style={semibold}>{history.graph.selectedLabel}</ThemedText>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1, minHeight: BAR }}>
      {history.graph.points.map((point) => {
        const on = point.day === history.day;
        return <Tappable key={point.day} testID={`history-bar-${point.day}`} accessibilityRole="button" accessibilityState={{ selected: on }}
          accessibilityLabel={routinesText(history.tab === 'skipped' ? 'graphSkipped' : 'graphLogged', { day: shortRoutineDay(point.day), count: point.count })}
          onPress={() => pick(point.day)} hitSlop={{ top: 8, bottom: 8 }} style={{ flex: 1, minHeight: BAR, justifyContent: 'flex-end' }}>
          <View style={{ minHeight: Math.max(2, Math.round((point.count / most) * BAR)), borderRadius: 2, backgroundColor: on ? colors.text : point.count ? tone : colors['surface-2'] }} />
        </Tappable>;
      })}
    </View>
    <Note testID="history-graph-note">{routinesText('graphNote')}</Note>
  </Panel>;
}

/** Routines history: the days with something on them, a month to pick a day from, or a count of logs per day. */
export function RoutinesHistory() {
  const routines = useRoutines(), haptic = useSelectionHaptic();
  const [mode, setMode] = useState<Mode>('days');
  const [cursor, setCursor] = useState<Partial<HistoryCursor>>({});
  const today = routines.dayOf(useMinuteClock());
  const tab = routineGraphTab(routines.view.prefs);
  const history = routineHistoryView(routines.view, { today, tab, month: cursor.month, day: cursor.day });
  const move = (monthDelta: number) => setCursor(current => routineHistoryCursor(current, today, { monthDelta }));
  const pick = (day: string) => { if (day !== history.day) haptic(); setCursor(current => routineHistoryCursor(current, today, { day })); };
  const selected = history.days.find(record => record.day === history.day) ?? null;
  return <Screen title={routinesText('history')}>
    <SegmentedControl label={routinesText('historyViews')} options={MODES} value={mode} onChange={setMode} />
    <MonthBar history={history} move={move} />
    {mode === 'days' && history.cards.map(record => <DayCard key={record.day} record={record} />)}
    {mode === 'calendar' && <Calendar history={history} pick={pick} />}
    {mode === 'graph' && <Graph history={history} pick={pick} onTab={next => { routines.apply((store, clock) => rememberGraphTab(store, next, clock)); }} />}
    {mode !== 'days' && selected && <DayCard record={selected} />}
  </Screen>;
}
