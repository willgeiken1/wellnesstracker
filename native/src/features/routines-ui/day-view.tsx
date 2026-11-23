import { useEffect, useState } from 'react';
import { AccessibilityInfo, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useLayoutMotion } from '@/components/layout-motion';
import { useSelectionHaptic } from '@/components/selection-haptic';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { touchTarget } from '@/components/button';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { logAllInBlock, logItem, logRest, skipItem, undoLog } from '@/features/routines/model/actions';
import { toggleCollapsed } from '@/features/routines/model/blocks';
import { routineRestLog, routineStreak, type RoutineRow } from '@/features/routines/model/day';
import { routineBlockWindow } from '@/features/routines/model/dose';
import { routineBlockCount, routineNowNext } from '@/features/routines/model/now';
import { hideTips, routineShows, setupOffered } from '@/features/routines/model/setup';
import type { RoutineBlock } from '@/features/routines/model/shape';
import { routineClock24, routineShortName, routineWindowLabel } from '@/features/routines/model/types';
import { routinesText } from '@/i18n/en';
import { slotColor } from './colors';
import { focusBlockId, hasItems, nextLine, rowAmount, rowDone, rowSkipped, rowSupply, rowTime } from './day-model';
import { routineRoutes, type RoutineLinkTarget } from './entry-points';
import { Glyph } from './glyph';
import { Note, Panel, PrimaryButton, TextButton, semibold } from './parts';
import { SunPath } from './sun-path';
import { routinesOn, sunDay } from './sun-model';
import type { Routines } from './use-routines';

/** Past this text size a row puts its time above its name, so the name keeps the width. */
export const ROW_STACKS_AT = 1.5;
const TICK = 28, RAIL = 48, INFO = 36;

/** What Log all just did, for the toast that offers to take it back. */
export interface LoggedAll { name: string; logIds: string[] }

/** The round tick at the end of a row. Drawn only: the row is the control. */
function Tick({ done, skipped, tone }: { done: boolean; skipped: boolean; tone: string }) {
  const { colors } = useTheme();
  return <View style={{ width: touchTarget, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' }}>
    <View testID={done ? 'tick-done' : skipped ? 'tick-skipped' : 'tick-open'} style={{ width: TICK, aspectRatio: 1, borderRadius: TICK / 2, alignItems: 'center', justifyContent: 'center',
      borderWidth: done ? 0 : 1.5, borderColor: colors['text-muted'], backgroundColor: done ? tone : 'transparent' }}>
      {done && <Glyph name="check" size={16} color={colors['on-accent']} width={2.4} />}
      {skipped && <Glyph name="dash" size={16} color={colors['text-muted']} width={2.2} />}
    </View>
  </View>;
}

function Row({ row, tone, due, first, supply, onLog, onSkip, onUndo, onDetails }: {
  row: RoutineRow; tone: string; due: boolean; first: boolean; supply: string; onLog: () => void; onSkip: () => void; onUndo: () => void; onDetails: () => void;
}) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= ROW_STACKS_AT;
  const done = rowDone(row), skipped = rowSkipped(row), handled = !row.open;
  const name = row.item.name || '', amount = rowAmount(row), time = rowTime(row);
  const when = due ? routinesText('now') : time;
  const spoken = [name, amount, skipped ? routinesText('skipped') : '', when, supply.split(' · ').join(', ')].filter(Boolean).join(', ');
  const actions = handled
    ? [{ name: 'undo', label: routinesText('undo') }, { name: 'details', label: routinesText('details') }]
    : [{ name: 'skip', label: routinesText('skip') }, { name: 'details', label: routinesText('details') }];
  const rail = <ThemedText variant="caption" numeric={!due} muted={!due} style={[{ width: stacked ? undefined : RAIL }, due && { color: tone, fontWeight: '600' }]}>{when}</ThemedText>;
  return <Tappable testID={`routine-row-${row.item.id}`} accessible accessibilityRole="checkbox" accessibilityLabel={spoken} accessibilityState={{ checked: done }}
    accessibilityActions={actions} onAccessibilityAction={(event) => {
      const action = event.nativeEvent.actionName;
      if (action === 'skip') onSkip(); else if (action === 'undo') onUndo(); else if (action === 'details') onDetails();
    }}
    onPress={handled ? onDetails : onLog} onLongPress={onDetails}
    style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], paddingVertical: tokens.spacing[0], borderTopWidth: first ? 0 : 1, borderTopColor: colors.hair }}>
    {!stacked && rail}
    <View style={{ flex: 1, gap: 2 }}>
      {stacked && !!when && rail}
      <ThemedText style={[semibold, handled && { textDecorationLine: done ? 'line-through' : 'none', opacity: 0.6 }]}>{name}</ThemedText>
      {!!amount && <ThemedText variant="caption" muted numeric>{amount}</ThemedText>}
      {skipped && <ThemedText variant="caption" muted>{routinesText('skipped')}</ThemedText>}
      {!!supply && <ThemedText testID={`routine-supply-${row.item.id}`} variant="caption" muted numeric>{supply}</ThemedText>}
    </View>
    {/* The row speaks for these: VoiceOver reaches Skip, Undo and Details as the row's own actions. */}
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', alignItems: 'center' }}>
      {/* A tap on an open row logs it, so its details and its edit form open from the info button, or from a
          long press anywhere on the row. A handled row opens them on a tap and needs no button. */}
      {!handled && <Tappable testID={`routine-details-${row.item.id}`} accessibilityRole="button" accessibilityLabel={routinesText('detailsOf', { name })} onPress={onDetails}
        hitSlop={{ left: (touchTarget - INFO) / 2, right: (touchTarget - INFO) / 2 }} style={{ width: INFO, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' }}>
        <Glyph name="info" size={20} color={colors['text-muted']} />
      </Tappable>}
      {handled
        ? <TextButton testID={`routine-undo-${row.item.id}`} label={routinesText('undo')} onPress={onUndo} pill />
        : <TextButton testID={`routine-skip-${row.item.id}`} label={routinesText('skip')} onPress={onSkip} pill />}
      <Tick done={done} skipped={skipped} tone={tone} />
    </View>
  </Tappable>;
}

/** One routine: its name and window, its count, and its rows. Folded, it is one line with a thin bar. */
function BlockCard({ block, routines, day, dueId, folded, rest, onFold, onLoggedAll }: {
  block: RoutineBlock; routines: Routines; day: string; dueId: string; folded: boolean; rest: boolean; onFold: () => void; onLoggedAll: (logged: LoggedAll) => void;
}) {
  const { colors } = useTheme();
  const haptic = useSelectionHaptic(), glide = useLayoutMotion();
  const tone = slotColor(colors, block.color);
  const count = routineBlockCount(routines.view, block.id, day);
  const name = routineShortName(block), window = routineWindowLabel(block), open = count.rows.filter(row => row.open).length;
  const change = (make: Parameters<Routines['apply']>[0]) => { glide(); if (routines.apply(make)) haptic(); };
  const logAll = () => {
    let ids: string[] = [];
    glide();
    const saved = routines.apply((store, clock) => { const result = logAllInBlock(store, block.id, clock); ids = result ? result.logIds : []; return result ? result.store : null; });
    if (saved && ids.length) { haptic(); onLoggedAll({ name, logIds: ids }); }
  };
  const starts = routineBlockWindow(block);
  const bar = <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: tone }} />;
  if (folded) {
    return <Panel testID={`routine-block-${block.id}`} style={{ overflow: 'hidden', padding: 0 }}>
      {bar}
      <Tappable testID={`routine-fold-${block.id}`} accessibilityRole="button" accessibilityState={{ expanded: false }}
        accessibilityLabel={routinesText('foldedSpoken', { name, done: count.done, total: count.total })} onPress={onFold}
        style={{ minHeight: 56, paddingVertical: tokens.spacing[1], paddingLeft: tokens.spacing[3], paddingRight: tokens.spacing[2], gap: tokens.spacing[1], justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacing[1] }}>
          <ThemedText variant="caption" style={[semibold, { color: tone }]}>{name}</ThemedText>
          <ThemedText variant="caption" muted numeric style={{ flex: 1 }}>
            {starts ? routinesText('foldedFrom', { time: routineClock24(starts.startMin), done: count.done, total: count.total }) : `${count.done}/${count.total}`}
          </ThemedText>
          <Glyph name="down" size={16} color={colors['text-muted']} />
        </View>
        <View testID="routine-fold-bar" style={{ borderRadius: 2, backgroundColor: colors['surface-2'], overflow: 'hidden' }}>
          <View style={{ width: `${count.total ? Math.round((count.done / count.total) * 100) : 0}%`, minHeight: 4, backgroundColor: tone }} />
        </View>
      </Tappable>
    </Panel>;
  }
  return <Panel testID={`routine-block-${block.id}`} style={{ overflow: 'hidden', paddingLeft: tokens.spacing[3], gap: 0 }}>
    {bar}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacing[1] }}>
      <Tappable testID={`routine-fold-${block.id}`} accessibilityRole="button" accessibilityState={{ expanded: true }}
        accessibilityLabel={routinesText('foldedSpoken', { name, done: count.done, total: count.total })} onPress={onFold}
        style={{ flex: 1, minHeight: touchTarget, justifyContent: 'center', gap: 2 }}>
        <ThemedText variant="caption" style={[semibold, { color: tone }]}>{name}</ThemedText>
        <ThemedText variant="caption" muted numeric>{window ? routinesText('blockLine', { window, done: count.done, total: count.total }) : `${count.done}/${count.total}`}</ThemedText>
      </Tappable>
      {/* A rest day covers every routine, so Log all would write nothing: it is not offered. */}
      {open >= 2 && !rest && <TextButton testID={`routine-log-all-${block.id}`} label={routinesText('logAll')} spoken={routinesText('logAllIn', { name })} onPress={logAll} color={colors.text} />}
    </View>
    {count.rows.map((row, index) => {
      const itemId = row.item.id ?? '', logId = row.log?.id ?? '';
      return <Row key={row.placement.id ?? itemId} row={row} tone={tone} due={row.open && itemId === dueId} first={index === 0} supply={rowSupply(row, routines.view, day)}
        onLog={() => change((store, clock) => logItem(store, itemId, clock))}
        onSkip={() => change((store, clock) => skipItem(store, itemId, clock))}
        onUndo={() => change((store, clock) => undoLog(store, logId, clock))}
        onDetails={() => router.push(routineRoutes.item(itemId, logId || undefined))} />;
    })}
    {!count.rows.length && <View style={{ minHeight: touchTarget, justifyContent: 'center' }}><Note>{routinesText('typeEmpty')}</Note></View>}
  </Panel>;
}

/** A chip of the top row: a streak, or the rest day. */
function ChipBox({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ minHeight: touchTarget, borderRadius: touchTarget / 2, backgroundColor: colors.surface, paddingHorizontal: tokens.spacing[2], flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[0] }}>{children}</View>;
}

/** The pill that follows Log all: it says what was logged and offers to take it back. It leaves by itself,
 * after longer when VoiceOver is on, and never moves. */
export function LoggedToast({ logged, bottom, onUndo, onDone }: { logged: LoggedAll | null; bottom: number; onUndo: (logged: LoggedAll) => void; onDone: () => void }) {
  const { colors } = useTheme();
  useEffect(() => {
    if (!logged) return;
    let timer: ReturnType<typeof setTimeout> | undefined, gone = false;
    const wait = (reader: boolean) => { if (!gone) timer = setTimeout(onDone, reader ? 10_000 : 3000); };
    AccessibilityInfo.announceForAccessibility(routinesText('loggedSpoken', { count: logged.logIds.length, name: logged.name }));
    AccessibilityInfo.isScreenReaderEnabled().then(wait, () => wait(false));
    return () => { gone = true; if (timer) clearTimeout(timer); };
  }, [logged, onDone]);
  if (!logged) return null;
  return <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: bottom + tokens.spacing[1], alignItems: 'center' }}>
    <View testID="routine-toast" style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], borderRadius: 99, backgroundColor: colors.text, paddingLeft: tokens.spacing[3], paddingRight: tokens.spacing[1] }}>
      <ThemedText style={[semibold, { color: colors.bg }]}>{routinesText('logged')}</ThemedText>
      <Tappable testID="routine-toast-undo" accessibilityRole="button" accessibilityLabel={routinesText('undo')} onPress={() => onUndo(logged)}
        style={{ minHeight: touchTarget, minWidth: touchTarget, paddingHorizontal: tokens.spacing[1], alignItems: 'center', justifyContent: 'center' }}>
        <ThemedText style={[semibold, { color: colors.bg, textDecorationLine: 'underline' }]}>{routinesText('undo')}</ThemedText>
      </Tappable>
    </View>
  </View>;
}

/** Today: the streak and rest chips, the sun path with its legend, each routine with its rows, and the way on
 * to new routines, editing and history. `jump` is the routine, or the item, a link asked to see. */
export function DayView({ routines, now, jump = null, onLoggedAll }: { routines: Routines; now: Date; jump?: RoutineLinkTarget | null; onLoggedAll: (logged: LoggedAll) => void }) {
  const { colors } = useTheme();
  const haptic = useSelectionHaptic(), glide = useLayoutMotion();
  // Routines other than the current one start folded; one opened by hand stays open until the page closes.
  const [opened, setOpened] = useState<readonly string[]>([]);
  const { view, store } = routines, day = routines.dayOf(now);
  const sun = sunDay(view, day), next = nextLine(view, now, day);
  const streak = routineStreak(view.logs, day), rest = routineRestLog(view.logs, day);
  const today = routinesOn(view, day), moment = routineNowNext(view.blocks, now, day);
  const currentId = moment.nowBlock?.id ?? '';
  const collapsed = new Set(view.prefs.collapsedBlocks ?? []);
  const focus = view.prefs.focusMode === true, focusId = focus ? focusBlockId(view, now, day) : '';
  const shown = focus ? today.filter(block => block.id === focusId) : today;
  // A link opens the routine it names, or the one that holds its item, so the rows it points at are drawn.
  // It is followed once: the routine can be folded again by hand, and the same link sent again reopens it.
  const [followed, setFollowed] = useState<RoutineLinkTarget | null>(null);
  if (jump !== followed) {
    setFollowed(jump);
    const named = jump ? today.find(block => block.id === jump.blockId) : undefined;
    const holder = named ?? (jump?.itemId ? today.find(block => view.placements.some(place => place.blockId === block.id && place.itemId === jump.itemId)) : undefined);
    const target = holder?.id ?? '';
    if (target && !opened.includes(target)) setOpened([...opened, target]);
  }
  const foldedOf = (block: RoutineBlock) => (block.id === currentId || today.length === 1 ? collapsed.has(block.id) : !opened.includes(block.id));
  const fold = (block: RoutineBlock) => {
    glide();
    if (block.id === currentId || today.length === 1) routines.apply((current, clock) => toggleCollapsed(current, block.id, clock));
    else setOpened(list => (list.includes(block.id) ? list.filter(id => id !== block.id) : [...list, block.id]));
  };
  const change = (make: Parameters<Routines['apply']>[0]) => { glide(); if (routines.apply(make)) haptic(); };
  const empty = !hasItems(view);
  return <>
    {(streak > 0 || routineShows('rest', store) || !!rest) && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[1] }}>
      {streak > 0 && <ChipBox><ThemedText testID="routine-streak" variant="caption" style={semibold}>{streak === 1 ? routinesText('streakOne') : routinesText('streakMany', { count: streak })}</ThemedText></ChipBox>}
      {rest
        ? <ChipBox>
          <ThemedText variant="caption" style={semibold}>{routinesText('restLogged')}</ThemedText>
          <TextButton testID="routine-rest-undo" label={routinesText('undo')} spoken={routinesText('undoRest')} onPress={() => change((current, clock) => undoLog(current, rest.id, clock))} color={colors.text} />
        </ChipBox>
        : routineShows('rest', store) && <ChipBox><TextButton testID="routine-rest" label={routinesText('logRest')} onPress={() => change((current, clock) => logRest(current, clock))} color={colors.text} /></ChipBox>}
    </View>}
    <Panel testID="routine-sun-card" style={{ padding: tokens.spacing[2] }}>
      <SunPath day={sun} now={now} next={next.text} />
      {/* The picture above already says all of this to VoiceOver. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacing[2], rowGap: tokens.spacing[0] }}>
        {sun.legend.map(row => <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[0] }}>
          <View style={{ width: 8, aspectRatio: 1, borderRadius: 4, backgroundColor: slotColor(colors, row.color) }} />
          <ThemedText variant="caption" muted numeric style={semibold}>{routinesText('legendCount', row)}</ThemedText>
        </View>)}
        {!!next.text && <ThemedText testID="routine-next" variant="caption" style={[semibold, { color: slotColor(colors, 'citrus'), flexGrow: 1, textAlign: 'right' }]}>{next.text}</ThemedText>}
      </View>
    </Panel>
    {!!rest && !empty && <Note testID="routine-rest-note">{routinesText('restCovers')}</Note>}
    {setupOffered(view.prefs) && <Panel testID="routine-setup-card" style={{ padding: tokens.spacing[3], gap: tokens.spacing[1] }}>
      <ThemedText variant="headline" accessibilityRole="header">{routinesText('setupTitle')}</ThemedText>
      <ThemedText muted>{routinesText('setupBody')}</ThemedText>
      <PrimaryButton label={routinesText('setupStart')} onPress={() => router.push(routineRoutes.setup())} />
    </Panel>}
    {empty && <Panel testID="routine-empty" style={{ padding: tokens.spacing[3], gap: tokens.spacing[1] }}>
      <ThemedText variant="headline" accessibilityRole="header">{routinesText('emptyTitle')}</ThemedText>
      <ThemedText muted>{routinesText('emptyBody')}</ThemedText>
      <PrimaryButton testID="routine-empty-add" label={routinesText('addItem')} onPress={() => router.push(routineRoutes.addItem())} />
    </Panel>}
    {!empty && routineShows('tips', store) && view.prefs.tipsHidden !== true && <Panel testID="routine-tips" style={{ padding: tokens.spacing[3], gap: tokens.spacing[1] }}>
      <ThemedText variant="headline" accessibilityRole="header">{routinesText('tipsTitle')}</ThemedText>
      {(['tipLog', 'tipSkip', 'tipEdit', 'tipGear'] as const).map(key => <ThemedText key={key} muted>{routinesText(key)}</ThemedText>)}
      <View style={{ alignItems: 'flex-start' }}><TextButton label={routinesText('tipsHide')} onPress={() => { glide(); routines.apply((current, clock) => hideTips(current, clock)); }} color={colors.text} /></View>
    </Panel>}
    {!empty && shown.map(block => <BlockCard key={block.id} block={block} routines={routines} day={day} dueId={next.soon ? next.itemId : ''}
      folded={!focus && foldedOf(block)} rest={!!rest} onFold={() => fold(block)} onLoggedAll={onLoggedAll} />)}
    {focus && !shown.length && !empty && <ThemedText testID="routine-focus-done" muted>{routinesText('focusDone')}</ThemedText>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: tokens.spacing[2] }}>
      <TextButton testID="routine-new" label={routinesText('newRoutine')} onPress={() => router.push(routineRoutes.newRoutine())} />
      <TextButton testID="routine-edit" label={routinesText('editRoutines')} onPress={() => router.push(routineRoutes.editRoutines())} />
      <TextButton testID="routine-history" label={routinesText('history')} onPress={() => router.push(routineRoutes.history())} />
    </View>
  </>;
}
