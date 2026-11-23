import { View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Svg from 'react-native-svg';
import { RingArc } from '@/components/ring-arc';
import { useLayoutMotion } from '@/components/layout-motion';
import { useSelectionHaptic } from '@/components/selection-haptic';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { touchTarget } from '@/components/button';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { logItem, skipItem, undoLog } from '@/features/routines/model/actions';
import { compoundFor, coveringLog, formatRoutineAmount } from '@/features/routines/model/day';
import { nextItemCountdown } from '@/features/routines/model/dose';
import { formatRoutineWait } from '@/features/routines/model/now';
import { routineShows } from '@/features/routines/model/setup';
import { routineSupplyView } from '@/features/routines/model/supply';
import { lastRoutineSite, routineSiteLabel, type RoutineItem } from '@/features/routines/model/shape';
import { routineDayLetters, routineDosesLeft, routineItemLabel, routineTypedItems, routineWeekTaken } from '@/features/routines/model/types';
import { routinesText } from '@/i18n/en';
import { toolColor } from './colors';
import { converterShown } from './converter-shown';
import { routineRoutes } from './entry-points';
import { Glyph, type GlyphName } from './glyph';
import { Note, Panel, TextButton, semibold } from './parts';
import type { Routines } from './use-routines';

/** Past this text size the three tools become rows and a card stacks its ring above its words. */
export const TYPE_STACKS_AT = 1.5;

function Tool({ glyph, label, onPress, rows, testID }: { glyph: GlyphName; label: string; onPress: () => void; rows: boolean; testID: string }) {
  const { colors } = useTheme();
  const tone = toolColor(colors);
  return <Tappable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={rows ? { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] } : { flex: 1, minHeight: touchTarget, alignItems: 'center', gap: tokens.spacing[1] }}>
    <View style={{ width: 52, aspectRatio: 1, borderRadius: 26, borderWidth: 1.5, borderColor: tone, alignItems: 'center', justifyContent: 'center' }}>
      <Glyph name={glyph} color={tone} />
    </View>
    <ThemedText variant="caption" style={[semibold, rows ? { flex: 1 } : { textAlign: 'center' }]}>{label}</ThemedText>
  </Tappable>;
}

/** What one item's card shows, in words and numbers. Pure, so the spoken label and the drawing agree. */
export function gaugeOf(routines: Routines, item: RoutineItem, now: Date) {
  const { view, store } = routines, day = routines.dayOf(now);
  const compound = compoundFor(view, item);
  const amountNumber = item.kind === 'dose' && compound && typeof compound.amount === 'number' ? formatRoutineAmount(compound.amount) : '';
  const amount = amountNumber ? (compound && compound.unit ? `${amountNumber} ${compound.unit}` : amountNumber) : '';
  const left = routineDosesLeft(item, view.logs);
  const week = routineWeekTaken(view.logs, item.id, day);
  const countdown = nextItemCountdown({ item, blocks: view.blocks, placements: view.placements, logs: view.logs, date: now, day, hour: view.settings.dayRolloverHour });
  const next = countdown ? (countdown.missed ? routinesText('overdue') : formatRoutineWait(countdown.waitMin)) : '';
  const site = routineShows('injection', store) ? routineSiteLabel(lastRoutineSite(store, item.id)) : '';
  const label = routineItemLabel(view, item);
  const log = coveringLog(view.logs, item.id, day);
  const state: '' | 'done' | 'skipped' = !log ? '' : log.status === 'skipped' ? 'skipped' : 'done';
  const stateText = state === 'done' ? routinesText('loggedToday') : state === 'skipped' ? routinesText('skippedToday') : '';
  // The ring already counts what is left, so the line under it keeps to the days left and the mixed day.
  const supply = routineSupplyView({ item, logs: view.logs, today: day }).text;
  const spoken = [
    [item.name, amount].filter(Boolean).join(', ') + '.',
    stateText ? `${stateText}.` : '',
    left ? `${routinesText('gaugeLeft', left)}.` : '',
    supply ? `${supply.split(' · ').join(', ')}.` : '',
    label ? `${label.split(' · ').join(', ')}.` : '',
    next ? routinesText('gaugeNextSpoken', { next }) : '',
    site ? routinesText('gaugeSiteSpoken', { site }) : '',
  ].filter(Boolean).join(' ');
  return { amount, left, week, next, site, label, spoken, supply, state, stateText, logId: log?.id ?? '' };
}

function Gauge({ routines, item, now }: { routines: Routines; item: RoutineItem; now: Date }) {
  const { colors, mode, ringLook, ringMotion, intensity } = useTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= TYPE_STACKS_AT, tone = toolColor(colors);
  const gauge = gaugeOf(routines, item, now), letters = routineDayLetters();
  const ring = stacked ? 88 : 64;
  const haptic = useSelectionHaptic(), glide = useLayoutMotion();
  const details = () => router.push(routineRoutes.item(item.id, gauge.logId || undefined));
  const change = (make: Parameters<Routines['apply']>[0]) => { glide(); if (routines.apply(make)) haptic(); };
  const log = () => change((store, clock) => logItem(store, item.id, clock));
  const skip = () => change((store, clock) => skipItem(store, item.id, clock));
  const undo = () => change((store, clock) => undoLog(store, gauge.logId, clock));
  /* An item on a type tab may sit in no routine, so its card is where it is logged, skipped and undone. */
  const actions = gauge.state
    ? [{ name: 'undo', label: routinesText('undo') }, { name: 'details', label: routinesText('details') }]
    : [{ name: 'log', label: routinesText('log') }, { name: 'skip', label: routinesText('skip') }, { name: 'details', label: routinesText('details') }];
  return <Tappable testID={`routine-gauge-${item.id}`} accessible accessibilityRole="button" accessibilityLabel={gauge.spoken} accessibilityActions={actions}
    onAccessibilityAction={(event) => {
      const action = event.nativeEvent.actionName;
      if (action === 'log') log(); else if (action === 'skip') skip(); else if (action === 'undo') undo(); else if (action === 'details') details();
    }}
    onPress={details}>
    <Panel style={{ padding: tokens.spacing[2], flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'flex-start' : 'center', gap: tokens.spacing[2] }}>
      {gauge.left && <View style={{ width: ring, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width="100%" height="100%" viewBox="0 0 64 64" style={{ position: 'absolute' }} accessible={false}>
          <RingArc look={ringLook} cx={32} cy={32} r={27} width={6} progress={gauge.left.total ? gauge.left.left / gauge.left.total : 0}
            color={tone} track={colors['surface-2']} ink={colors.text} dark={mode === 'dark'} echoes={false} motion={ringMotion} intensity={intensity} />
        </Svg>
        {!stacked && <ThemedText testID="routine-gauge-left" variant="headline" numeric>{gauge.left.left}</ThemedText>}
      </View>}
      <View style={{ flex: stacked ? undefined : 1, alignSelf: 'stretch', gap: tokens.spacing[0] }}>
        {gauge.left && <ThemedText variant="caption" muted numeric>{stacked ? routinesText('gaugeLeft', gauge.left) : routinesText('gaugeOf', { total: gauge.left.total })}</ThemedText>}
        {!!gauge.label && <ThemedText variant="caption" numeric style={[semibold, { color: tone }]}>{gauge.label}</ThemedText>}
        <ThemedText variant="headline">{item.name}</ThemedText>
        {!!gauge.amount && <ThemedText variant="caption" muted numeric>{gauge.amount}</ThemedText>}
        <View testID="routine-week" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[0] }}>
          {letters.map((letter, index) => {
            const taken = gauge.week.days[index] === true, today = gauge.week.today === index;
            return <View key={index} testID={taken ? 'routine-week-taken' : 'routine-week-open'} style={{ minWidth: 26, paddingHorizontal: tokens.spacing[0], paddingVertical: 2, borderRadius: 8, alignItems: 'center',
              backgroundColor: taken ? tone : colors['surface-2'], borderWidth: 1.5, borderColor: today ? colors.text : 'transparent' }}>
              <ThemedText variant="caption" style={[semibold, { color: taken ? colors['on-accent'] : colors['text-muted'] }]}>{letter}</ThemedText>
            </View>;
          })}
        </View>
        {!!gauge.next && <ThemedText variant="caption" muted>{routinesText('gaugeNext')} <ThemedText variant="caption" style={semibold}>{gauge.next}</ThemedText></ThemedText>}
        {!!gauge.site && <ThemedText variant="caption" muted>{routinesText('gaugeLastSite')} <ThemedText variant="caption" style={semibold}>{gauge.site}</ThemedText></ThemedText>}
        {!!gauge.supply && <ThemedText testID={`routine-gauge-supply-${item.id}`} variant="caption" muted numeric>{gauge.supply}</ThemedText>}
        {/* The card speaks for these: VoiceOver reaches Log, Skip and Undo as the card's own actions. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacing[1] }}>
          {gauge.state
            ? <>
              <ThemedText testID={`routine-gauge-state-${item.id}`} variant="caption" style={[semibold, { color: tone }]}>{gauge.stateText}</ThemedText>
              <TextButton testID={`routine-gauge-undo-${item.id}`} label={routinesText('undo')} onPress={undo} pill />
            </>
            : <>
              <TextButton testID={`routine-gauge-log-${item.id}`} label={routinesText('log')} onPress={log} color={colors.text} pill />
              <TextButton testID={`routine-gauge-skip-${item.id}`} label={routinesText('skip')} onPress={skip} pill />
            </>}
        </View>
      </View>
    </Panel>
  </Tappable>;
}

/** One item type's tab: its tools, then a card for each item of that type with what is left and this week. */
export function TypeView({ routines, type, now }: { routines: Routines; type: string; now: Date }) {
  const { fontScale } = useWindowDimensions();
  const rows = fontScale >= TYPE_STACKS_AT;
  const peptide = type === 'peptide';
  const items = routineTypedItems(routines.view, type);
  const doses = routineShows('doses', routines.store) || peptide;
  return <>
    <View testID="routine-tools" style={rows ? { gap: tokens.spacing[0] } : { flexDirection: 'row', gap: tokens.spacing[1], alignItems: 'flex-start' }}>
      {peptide && converterShown(routines.store) && <Tool testID="routine-tool-converter" glyph="converter" label={routinesText('converter')} rows={rows} onPress={() => router.push(routineRoutes.converter())} />}
      {peptide && routineShows('injection', routines.store) && <Tool testID="routine-tool-sites" glyph="site" label={routinesText('sites')} rows={rows} onPress={() => router.push(routineRoutes.sites())} />}
      <Tool testID="routine-tool-add" glyph="plus" label={routinesText(peptide ? 'addPeptide' : 'addOther')} rows={rows} onPress={() => router.push(routineRoutes.addItem({ type }))} />
    </View>
    {items.map(item => <Gauge key={item.id} routines={routines} item={item} now={now} />)}
    {!items.length && <ThemedText testID="routine-type-empty" muted>{routinesText(peptide ? 'peptidesEmpty' : 'typeEmpty')}</ThemedText>}
    {!!items.length && doses && <Note testID="routine-type-note">{routinesText('typeNote')}</Note>}
  </>;
}
