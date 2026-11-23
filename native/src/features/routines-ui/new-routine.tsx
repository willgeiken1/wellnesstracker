import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useLayoutMotion } from '@/components/layout-motion';
import { useSelectionHaptic } from '@/components/selection-haptic';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { rs, type RoutinesSheetsKey } from '@/i18n/en';
import {
  blockDraft, blockMoves, hideBlock, moveBlock, ROUTINE_BLOCK_COLORS, routineDraftWindow, saveBlock, toggleDraftDay, toggleDraftItem, type BlockDraftValues,
} from '@/features/routines/model/blocks';
import type { RoutineView } from '@/features/routines/model/shape';
import { routineClock24, routineDayLetters } from '@/features/routines/model/types';
import { clockMinutes, stepClock, typedClock, type ArcWindow } from './add-item-arc';
import { commitRoutines, newRoutineId, routineClockNow, useRoutines, type RoutinesData } from './add-item-data';
import { announce, Block, ErrorLine, Help, OutlineButton, PrimaryButton, SheetFrame, SheetUnavailable, useSheetClose } from './add-item-frame';
import { Glyph } from './add-item-glyphs';
import { WindowArc } from './add-item-sun-arc';
import { slotColor } from './add-item-tones';

const DAY_NAMES: readonly RoutinesSheetsKey[] = ['dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat', 'daySun'];
const COLOR_NAMES: Readonly<Record<string, RoutinesSheetsKey>> = { citrus: 'colorCitrus', lavender: 'colorLavender', pink: 'colorPink' };

/** One of the two times of a routine: a field to type in, and a step either way. */
function TimeField({ testID, label, minutes, onMinutes }: { testID: string; label: string; minutes: number; onMinutes: (minutes: number) => void }) {
  const { colors } = useTheme();
  const [typing, setTyping] = useState<string | null>(null);
  const end = () => {
    if (typing == null) return;
    const typed = clockMinutes(typedClock(typing) ?? '');
    setTyping(null);
    if (typed != null) onMinutes(typed);
  };
  const stepButton = (by: number) => (
    <Tappable testID={`${testID}-${by < 0 ? 'earlier' : 'later'}`} accessibilityRole="button" accessibilityLabel={`${label}, ${by < 0 ? rs('earlier') : rs('later')}`} onPress={() => onMinutes(stepClock(minutes, by))}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors['surface-2'] }}>
      <Glyph name={by < 0 ? 'minus' : 'add'} size={20} color={colors.text} weight={2.2} />
    </Tappable>
  );
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: tokens.spacing[1] }}>
    <ThemedText style={{ fontWeight: '600', flexGrow: 1, flexBasis: 88 }}>{label}</ThemedText>
    {stepButton(-15)}
    <TextInput testID={testID} accessibilityLabel={label} value={typing ?? routineClock24(minutes)} onChangeText={setTyping} onFocus={() => setTyping(routineClock24(minutes))} onBlur={end} onSubmitEditing={end}
      keyboardType="numbers-and-punctuation" returnKeyType="done" maxLength={5} selectTextOnFocus selectionColor={colors.accent}
      style={{ minWidth: 84, minHeight: 44, borderRadius: 12, paddingHorizontal: tokens.spacing[2], backgroundColor: colors['surface-2'], color: colors.text, textAlign: 'center',
        fontSize: tokens.type.body, fontFamily: tokens.font.numeral, fontVariant: ['tabular-nums'] }} />
    {stepButton(15)}
  </View>;
}

function RoutineForm({ data, view, opened }: { data: RoutinesData; view: RoutineView; opened: BlockDraftValues }) {
  const { colors } = useTheme();
  const tick = useSelectionHaptic();
  const glide = useLayoutMotion();
  const [draft, setDraft] = useState<BlockDraftValues>(opened);
  const [error, setError] = useState('');
  const [dayHint, setDayHint] = useState('');
  const [adding, setAdding] = useState(false);
  const [nameFocus, setNameFocus] = useState(false);
  const { close, leave } = useSheetClose(JSON.stringify(draft) !== JSON.stringify(opened));
  const editing = !!opened.blockId;
  const clock = routineClockNow(data.store);
  const change = (patch: Partial<BlockDraftValues>) => { setDraft((current) => ({ ...current, ...patch })); setError(''); };

  const window = routineDraftWindow(draft.startMin, draft.endMin) ?? { startMin: draft.startMin, endMin: draft.endMin };
  const setWindow = (next: ArcWindow) => change({ startMin: next.startMin % 1440, endMin: next.endMin % 1440 });
  const stepEnd = (end: 0 | 1, by: number) => change(end === 0 ? { startMin: stepClock(draft.startMin, by) } : { endMin: stepClock(draft.endMin, by) });

  const toggleDay = (index: number) => {
    const days = toggleDraftDay(draft.days, index);
    if (!days) { setDayHint(rs('errDays')); announce(rs('errDays')); return; }
    tick(); setDayHint(''); change({ days });
  };
  const toggleItem = (itemId: string) => {
    const itemIds = toggleDraftItem(draft.itemIds, itemId);
    if (itemIds) { glide(); change({ itemIds }); }
  };

  const save = () => {
    if (!draft.name.trim() || !routineDraftWindow(draft.startMin, draft.endMin)) { setError(rs('errRoutine')); announce(rs('errRoutine')); return; }
    const result = saveBlock(data.store, draft, clock, newRoutineId);
    if (!result || !commitRoutines(data.repository, result.store)) { setError(rs('notSaved')); announce(rs('notSaved')); return; }
    leave();
  };

  /* Moving saves at once: the order is the page's, not this draft's. */
  const moves = blockMoves(view, opened.blockId);
  const move = (by: -1 | 1) => {
    const next = moveBlock(data.store, opened.blockId, by, clock);
    if (!next || !commitRoutines(data.repository, next)) { setError(rs('notSaved')); announce(rs('notSaved')); return; }
    glide();
    const order = view.blocks.map((block) => block.id);
    announce(rs('movedTo', { name: opened.name, place: order.indexOf(opened.blockId ?? '') + 1 + by, count: order.length }));
  };
  const hide = () => {
    const next = hideBlock(data.store, opened.blockId, clock);
    if (!next || !commitRoutines(data.repository, next)) { setError(rs('notSaved')); announce(rs('notSaved')); return; }
    leave();
  };

  const items = view.items;
  const inside = draft.itemIds.map((id) => items.find((item) => item.id === id)).filter((item) => !!item);
  const outside = items.filter((item) => !draft.itemIds.includes(item.id));
  const place = view.blocks.findIndex((block) => block.id === opened.blockId) + 1;
  const letters = routineDayLetters();
  const moveButton = (by: -1 | 1, allowed: boolean) => (
    <Tappable testID={by < 0 ? 'routine-move-up' : 'routine-move-down'} accessibilityRole="button" accessibilityLabel={rs(by < 0 ? 'moveUpNamed' : 'moveDownNamed', { name: opened.name })}
      accessibilityState={{ disabled: !allowed }} disabled={!allowed} onPress={() => move(by)}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors['surface-2'], opacity: allowed ? 1 : 0.35 }}>
      <Glyph name={by < 0 ? 'up' : 'down'} size={20} color={colors.text} weight={2.2} />
    </Tappable>
  );

  return <SheetFrame testID="routine-sheet" title={editing ? rs('editRoutine') : rs('newRoutine')} onClose={close}>
    <TextInput testID="routine-name" accessibilityLabel={rs('name')} value={draft.name} onChangeText={(name) => change({ name })} placeholder={rs('name')}
      placeholderTextColor={colors['text-muted']} autoFocus={!editing} autoCapitalize="sentences" returnKeyType="done" maxLength={60}
      onFocus={() => setNameFocus(true)} onBlur={() => setNameFocus(false)} selectionColor={colors.accent}
      style={{ color: colors.text, fontSize: tokens.type.title, fontFamily: tokens.font.heading, paddingVertical: tokens.spacing[1], minHeight: 48,
        borderBottomWidth: 2, borderBottomColor: nameFocus ? colors.accent : colors['hair-2'] }} />

    <Block label={rs('when')}>
      <View style={{ backgroundColor: colors['surface-2'], borderRadius: 20, padding: tokens.spacing[2] }}>
        <WindowArc window={window} color={slotColor(colors, draft.color)} onWindow={setWindow} onStep={stepEnd} />
      </View>
      <TimeField testID="routine-start" label={rs('startsAt')} minutes={draft.startMin} onMinutes={(startMin) => change({ startMin })} />
      <TimeField testID="routine-end" label={rs('endsAt')} minutes={draft.endMin} onMinutes={(endMin) => change({ endMin })} />
    </Block>

    <Block label={rs('days')}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[0], justifyContent: 'space-between' }}>
        {letters.map((letter, index) => {
          const on = draft.days.includes(index);
          return <Tappable key={DAY_NAMES[index]} testID={`routine-day-${index}`} accessibilityRole="checkbox" accessibilityLabel={rs(DAY_NAMES[index])} accessibilityState={{ checked: on }} onPress={() => toggleDay(index)}
            style={{ minWidth: 44, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 0 : 1.5, borderColor: colors['hair-2'], backgroundColor: on ? colors.text : 'transparent' }}>
            <ThemedText style={{ fontWeight: '600', color: on ? colors.bg : colors['text-muted'] }}>{letter}</ThemedText>
          </Tappable>;
        })}
      </View>
      {!!dayHint && <ErrorLine testID="routine-day-hint">{dayHint}</ErrorLine>}
    </Block>

    <Block label={rs('color')}>
      <View accessibilityRole="radiogroup" accessibilityLabel={rs('color')} style={{ flexDirection: 'row', gap: tokens.spacing[1] }}>
        {ROUTINE_BLOCK_COLORS.map((color) => {
          const on = draft.color === color;
          return <Tappable key={color} testID={`routine-color-${color}`} accessibilityRole="radio" accessibilityLabel={rs('colorLabel', { name: rs(COLOR_NAMES[color]) })} accessibilityState={{ checked: on }}
            onPress={() => { if (!on) { tick(); change({ color }); } }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: on ? colors.text : 'transparent' }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: slotColor(colors, color) }} />
            </View>
          </Tappable>;
        })}
      </View>
    </Block>

    <Block label={rs('items')}>
      {!!inside.length && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[1] }}>
        {inside.map((item) => (
          <Tappable key={item.id} testID={`routine-item-${item.id}`} accessibilityRole="button" accessibilityLabel={rs('itemRemove', { name: item.name })} onPress={() => toggleItem(item.id)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[0], minHeight: 44, borderRadius: 22, paddingHorizontal: tokens.spacing[2], backgroundColor: colors['surface-2'] }}>
            <ThemedText variant="caption" style={{ fontWeight: '600', flexShrink: 1 }}>{item.name}</ThemedText>
            <Glyph name="close" size={14} color={colors['text-muted']} weight={2.4} />
          </Tappable>
        ))}
      </View>}
      <Tappable testID="routine-items-more" accessibilityRole="button" accessibilityLabel={rs('itemsMore')} accessibilityState={{ expanded: adding }} onPress={() => { glide(); setAdding(!adding); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], minHeight: 44 }}>
        <Glyph name={adding ? 'down' : 'add'} size={18} color={colors.accent} weight={2.2} />
        <ThemedText style={{ color: colors.accent, fontWeight: '600' }}>{rs('itemsMore')}</ThemedText>
      </Tappable>
      {adding && (outside.length
        ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[1] }}>
          {outside.map((item) => (
            <Tappable key={item.id} testID={`routine-add-${item.id}`} accessibilityRole="button" accessibilityLabel={rs('itemAdd', { name: item.name })} onPress={() => toggleItem(item.id)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[0], minHeight: 44, borderRadius: 22, paddingHorizontal: tokens.spacing[2], borderWidth: 1.5, borderColor: colors['hair-2'] }}>
              <Glyph name="add" size={14} color={colors['text-muted']} weight={2.4} />
              <ThemedText variant="caption" style={{ fontWeight: '600', flexShrink: 1 }}>{item.name}</ThemedText>
            </Tappable>
          ))}
        </View>
        : <Help>{rs('itemsNone')}</Help>)}
    </Block>

    {editing && <Block label={rs('order')} aside={place > 0 ? rs('setupStep', { step: place, count: view.blocks.length }) : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1] }}>
        {moveButton(-1, moves.up)}
        {moveButton(1, moves.down)}
      </View>
    </Block>}

    <View style={{ gap: tokens.spacing[1] }}>
      <PrimaryButton testID="routine-save" label={rs('saveRoutine')} onPress={save} />
      {!!error && <ErrorLine testID="routine-error">{error}</ErrorLine>}
      {editing && <>
        <OutlineButton testID="routine-hide" label={rs('hide')} tone="muted" onPress={hide} />
        <Help>{rs('hideHelp')}</Help>
      </>}
    </View>
  </SheetFrame>;
}

/** New routine, and Edit routine when it is opened with a routine's id. */
export function RoutineSheet({ blockId }: { blockId?: string }) {
  const data = useRoutines();
  const { close } = useSheetClose(false);
  const title = blockId ? rs('editRoutine') : rs('newRoutine');
  if (!data.view) return <SheetUnavailable testID="routine-sheet" title={title} onClose={close} />;
  const opened = blockDraft(data.view, blockId ?? null);
  if (!opened) {
    return <SheetFrame testID="routine-sheet" title={title} onClose={close}>
      <ThemedText testID="routine-gone" muted>{rs('routineGone')}</ThemedText>
    </SheetFrame>;
  }
  return <RoutineOpened key={blockId ?? 'new'} data={data} view={data.view} opened={opened} />;
}

/* Keeps what the sheet opened with, so a save elsewhere (a move) does not reset what is being typed. */
function RoutineOpened({ data, view, opened }: { data: RoutinesData; view: RoutineView; opened: BlockDraftValues }) {
  const [first] = useState(opened);
  return <RoutineForm data={data} view={view} opened={first} />;
}
