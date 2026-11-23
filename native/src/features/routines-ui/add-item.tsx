import { useEffect, useState } from 'react';
import { Alert, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { useLayoutMotion } from '@/components/layout-motion';
import { useSelectionHaptic } from '@/components/selection-haptic';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { rs } from '@/i18n/en';
import { deleteItem, saveItem, saveItemNote } from '@/features/routines/model/actions';
import { ROUTINE_DOSE_UNITS } from '@/features/routines/model/day';
import { routineShows } from '@/features/routines/model/setup';
import type { RoutineView } from '@/features/routines/model/shape';
import { addCustomType, CUSTOM_TYPE_MAX, routineClock24, routineCustomTypes } from '@/features/routines/model/types';
import { AmountCard, AmountMeter } from './add-item-amount-card';
import { doseReadback, parseSheetAmount } from './add-item-amounts';
import { arcReadout, arcStepMinutes, clockMinutes, typedClock } from './add-item-arc';
import { openConverterDraft, type ConverterDraft } from './converter';
import { ConverterStep } from './converter-step';
import { commitRoutines, newRoutineId, routineClockNow, useRoutines, type RoutinesData } from './add-item-data';
import { CONCENTRATION_CONVERTER_ENABLED } from './converter-flag';
import { announce, Block, ErrorLine, Help, OutlineButton, PrimaryButton, SheetFrame, SheetUnavailable, useSheetClose } from './add-item-frame';
import { Glyph, type GlyphName } from './add-item-glyphs';
import {
  dayLabel, itemDraftProblem, itemSaveDraft, openItemDraft, sameItemDraft, sheetRoutines, sheetTypeChoices, stepMixedDay, tapItemRoutine, tapItemType,
  type ItemSheetDraft, type ItemSheetSource,
} from './add-item-draft';
import { TimeArc } from './add-item-sun-arc';
import { slotColor, veil } from './add-item-tones';

const BUILT_IN = new Set<string>(['supplement', 'peptide', 'medication', 'enhancer', 'other']);
const glyphFor = (type: string): GlyphName => (BUILT_IN.has(type) ? (type as GlyphName) : 'custom');

/** A round 44 button with a line icon, for the small steps beside a field. */
function RoundButton({ testID, label, glyph, onPress, disabled = false }: { testID: string; label: string; glyph: GlyphName; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return <Tappable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors['surface-2'], opacity: disabled ? 0.35 : 1 }}>
    <Glyph name={glyph} size={20} color={colors.text} weight={2.2} />
  </Tappable>;
}

/** A small text button in a pill, 44 high to the finger. */
function PillButton({ testID, label, onPress, disabled = false }: { testID: string; label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return <Tappable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: tokens.spacing[2], borderRadius: 22, backgroundColor: colors['surface-2'], opacity: disabled ? 0.35 : 1 }}>
    <ThemedText variant="caption" style={{ fontWeight: '600' }}>{label}</ThemedText>
  </Tappable>;
}

function ItemForm({ data, view, source, startInConverter }: { data: RoutinesData; view: RoutineView; source: ItemSheetSource; startInConverter: boolean }) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const tick = useSelectionHaptic();
  const glide = useLayoutMotion();
  const [opened] = useState(() => openItemDraft(view, source));
  const [draft, setDraft] = useState<ItemSheetDraft>(opened);
  const [step, setStep] = useState<'form' | 'converter'>(startInConverter && CONCENTRATION_CONVERTER_ENABLED ? 'converter' : 'form');
  const [calc, setCalc] = useState<ConverterDraft>(() => openConverterDraft());
  const [error, setError] = useState('');
  const [hint, setHint] = useState<{ at: 'type' | 'routine'; text: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [nameFocus, setNameFocus] = useState(false);
  const [timeText, setTimeText] = useState<string | null>(null);
  const { close, leave } = useSheetClose(!sameItemDraft(draft, opened));

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const editing = !!opened.itemId;
  const title = editing ? rs('editItem') : rs('addItem');
  const clock = routineClockNow(data.store);
  const doseOffered = opened.kind === 'dose' || routineShows('doses', data.store);
  const supplyOffered = draft.kind === 'dose' || draft.onHand !== '';
  const converterOffered = CONCENTRATION_CONVERTER_ENABLED && draft.kind === 'dose' && draft.type === 'peptide';
  const savedItem = editing ? view.items.find((row) => row.id === opened.itemId) : undefined;
  const types = sheetTypeChoices(view);
  const routines = sheetRoutines(view);
  const picked = routines.filter((routine) => draft.blockIds.includes(routine.id));
  const timeMin = clockMinutes(draft.time);
  const readout = arcReadout({ timeMin, routines, picked });
  const amount = parseSheetAmount(draft.amount);
  const canAddType = routineCustomTypes(view.prefs).length < CUSTOM_TYPE_MAX;

  const change = (patch: Partial<ItemSheetDraft>) => { setDraft((current) => ({ ...current, ...patch })); setError(''); };
  const refuse = (at: 'type' | 'routine', text: string) => { setHint({ at, text }); announce(text); };

  const pickType = (type: string) => {
    const result = tapItemType(draft, type);
    if (result.refused) { refuse('type', rs(result.refused)); return; }
    const next = !doseOffered && result.draft.kind === 'dose' && draft.kind !== 'dose' ? { ...result.draft, kind: draft.kind } : result.draft;
    tick();
    if (next.kind !== draft.kind || (next.type === 'peptide') !== (draft.type === 'peptide')) glide();
    setDraft(next); setHint(null); setError('');
  };
  const pickRoutine = (blockId: string) => {
    const result = tapItemRoutine(draft, blockId);
    if (result.refused) { refuse('routine', rs(result.refused)); return; }
    tick(); setDraft(result.draft); setHint(null); setError('');
  };
  const pickKind = (kind: 'check' | 'dose') => {
    if (kind === draft.kind) return;
    tick(); glide(); change({ kind });
  };
  const addType = () => {
    const result = addCustomType(data.store, naming ?? '', clock, newRoutineId);
    if (!result || !result.added) { setHint({ at: 'type', text: rs('newTypeTaken') }); announce(rs('newTypeTaken')); return; }
    if (!commitRoutines(data.repository, result.store)) { setHint({ at: 'type', text: rs('notSaved') }); announce(rs('notSaved')); return; }
    tick(); glide(); setNaming(null); setHint(null); change({ type: result.typeId });
  };

  const setTime = (minutes: number | null) => { setTimeText(null); change({ time: minutes == null ? '' : routineClock24(minutes) }); };
  const stepTime = (by: number) => {
    const from = timeMin ?? (picked.length === 1 && picked[0].window ? picked[0].window.startMin % 1440 : 12 * 60);
    const next = arcStepMinutes(from, timeMin == null ? 0 : by);
    if (next != null) setTime(next);
  };
  const endTime = () => {
    if (timeText == null) return;
    const text = timeText.trim();
    const typed = typedClock(text);
    if (!text) setTime(null);
    else if (typed) setTime(clockMinutes(typed));
    else setTimeText(null);
  };

  const save = () => {
    const problem = itemDraftProblem(draft, clock.day);
    if (problem) { setError(problem); announce(problem); return; }
    const result = saveItem(data.store, itemSaveDraft(draft), clock, newRoutineId);
    if (!result || !commitRoutines(data.repository, result.store)) { setError(rs('notSaved')); announce(rs('notSaved')); return; }
    leave();
  };
  const remove = () => {
    Alert.alert(rs('removeItemTitle'), rs('removeItemBody'), [
      { text: rs('cancel'), style: 'cancel' },
      { text: rs('remove'), style: 'destructive', onPress: () => {
        const next = deleteItem(data.store, opened.itemId, clock);
        if (!commitRoutines(data.repository, next)) { setError(rs('notSaved')); announce(rs('notSaved')); return; }
        leave();
      } },
    ]);
  };

  const [calcError, setCalcError] = useState('');
  const openConverter = () => { setCalc(openConverterDraft(draft.amount, draft.unit)); setCalcError(''); setStep('converter'); };
  const saveNote = (note: string, inputs: { vialAmount: unknown; waterMl: unknown; vialUnit: string }) => {
    const next = saveItemNote(data.store, opened.itemId, note, clock, inputs);
    if (!note || !commitRoutines(data.repository, next)) { setCalcError(rs('noteFailed')); announce(rs('noteFailed')); return; }
    setStep('form'); setToast(rs('noteSaved')); announce(rs('noteSaved'));
  };

  if (step === 'converter' && CONCENTRATION_CONVERTER_ENABLED) {
    return <ConverterStep draft={calc} onDraft={setCalc} backLabel={title} onBack={() => setStep('form')} onClose={close}
      canSave={!!savedItem && savedItem.kind === 'dose'} onSave={saveNote} error={calcError} />;
  }

  const largeText = fontScale >= 1.3;
  const oneRow = width >= 384 && types.length + (canAddType ? 1 : 0) <= 6;
  const typeCell = (key: string, label: string, glyph: GlyphName, on: boolean, onPress: () => void, dashed = false) => (
    <Tappable key={key} testID={`item-type-${key}`} accessibilityRole={dashed ? 'button' : 'radio'} accessibilityLabel={label} accessibilityState={dashed ? undefined : { checked: on }} onPress={onPress}
      style={largeText ? { width: 96, alignItems: 'center', gap: tokens.spacing[0] } : { flexGrow: 1, flexBasis: oneRow ? 0 : '30%', alignItems: 'center', gap: tokens.spacing[0], minHeight: 68 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 0 : 1.5, borderStyle: dashed ? 'dashed' : 'solid',
        borderColor: dashed ? colors['text-muted'] : colors['hair-2'], backgroundColor: on ? colors.sleep : 'transparent' }}>
        <Glyph name={glyph} size={22} color={on ? colors['on-accent'] : colors.text} />
      </View>
      <ThemedText variant="caption" numberOfLines={2} style={{ fontWeight: '600', textAlign: 'center', color: on ? colors.text : colors['text-muted'] }}>{label}</ThemedText>
    </Tappable>
  );
  const typeCells = [
    ...types.map((choice) => typeCell(choice.id, choice.name, glyphFor(choice.id), draft.type === choice.id, () => pickType(choice.id))),
    ...(canAddType ? [typeCell('new', rs('newType'), 'add', false, () => { glide(); setNaming(naming == null ? '' : null); setHint(null); }, true)] : []),
  ];
  const kindCard = (kind: 'check' | 'dose', label: string, line: string) => {
    const on = draft.kind === kind;
    return <Tappable key={kind} testID={`item-kind-${kind}`} accessibilityRole="radio" accessibilityLabel={`${label}. ${line}`} accessibilityState={{ checked: on }} onPress={() => pickKind(kind)}
      style={{ flexGrow: 1, flexBasis: fontScale >= 1.5 ? '100%' : 0, borderRadius: 18, padding: tokens.spacing[2], gap: 2, minHeight: 64, backgroundColor: on ? colors.accent : colors['surface-2'] }}>
      <ThemedText variant="headline" style={{ fontWeight: '600', color: on ? colors['on-accent'] : colors.text }}>{label}</ThemedText>
      <ThemedText variant="caption" style={{ color: on ? colors['on-accent'] : colors['text-muted'] }}>{line}</ThemedText>
    </Tappable>;
  };

  return <SheetFrame testID="add-item" title={title} onClose={close} toast={toast}>
    <TextInput testID="item-name" accessibilityLabel={rs('name')} value={draft.name} onChangeText={(name) => change({ name })} placeholder={rs('name')}
      placeholderTextColor={colors['text-muted']} autoFocus={!editing} autoCapitalize="sentences" returnKeyType="done" maxLength={80}
      onFocus={() => setNameFocus(true)} onBlur={() => setNameFocus(false)} selectionColor={colors.accent}
      style={{ color: colors.text, fontSize: tokens.type.title, fontFamily: tokens.font.heading, paddingVertical: tokens.spacing[1], minHeight: 48,
        borderBottomWidth: 2, borderBottomColor: nameFocus ? colors.accent : colors['hair-2'] }} />

    <Block label={rs('type')} aside={rs('optional')}>
      {largeText
        ? <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" accessibilityLabel={rs('type')} contentContainerStyle={{ gap: tokens.spacing[1] }}>{typeCells}</ScrollView>
        : <View accessibilityRole="radiogroup" accessibilityLabel={rs('type')} style={{ flexDirection: 'row', flexWrap: oneRow ? 'nowrap' : 'wrap', gap: tokens.spacing[1], rowGap: tokens.spacing[2] }}>{typeCells}</View>}
      {naming != null && <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1] }}>
        <TextInput testID="item-type-name" accessibilityLabel={rs('newType')} value={naming} onChangeText={setNaming} placeholder={rs('newTypeName')} placeholderTextColor={colors['text-muted']}
          autoFocus maxLength={40} returnKeyType="done" onSubmitEditing={addType} selectionColor={colors.accent}
          style={{ flex: 1, minHeight: 44, borderRadius: 12, paddingHorizontal: tokens.spacing[2], backgroundColor: colors['surface-2'], color: colors.text, fontSize: tokens.type.body }} />
        <PillButton testID="item-type-add" label={rs('newTypeAdd')} onPress={addType} />
      </View>}
      {hint?.at === 'type' && <ErrorLine testID="item-type-hint">{hint.text}</ErrorLine>}
    </Block>

    {doseOffered && <Block label={rs('logAs')}>
      <View accessibilityRole="radiogroup" accessibilityLabel={rs('logAs')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[1] }}>
        {kindCard('check', rs('check'), rs('checkLine'))}
        {kindCard('dose', rs('dose'), rs('doseLine'))}
      </View>
    </Block>}

    {draft.kind === 'dose' && <View style={{ gap: tokens.spacing[1] }}>
      <AmountCard testID="item-dose" label={rs('amount')} value={draft.amount} onChange={(text) => change({ amount: text })} tone="accent" filled
        units={ROUTINE_DOSE_UNITS} unit={draft.unit} onUnit={(unit) => change({ unit })} stepsLabel={rs('changeAmount')}>
        <AmountMeter amount={amount} ink={colors['on-accent']} track={veil(colors.accent, colors['on-accent'])} />
        <ThemedText testID="item-readback" accessibilityLiveRegion="polite" style={{ color: colors['on-accent'], fontWeight: '600' }}>{doseReadback(amount, draft.unit)}</ThemedText>
        <ThemedText testID="item-dose-note" variant="caption" style={{ color: colors['on-accent'] }}>{rs('doseNote')}</ThemedText>
      </AmountCard>
      {converterOffered && <Tappable testID="item-converter" accessibilityRole="button" accessibilityLabel={`${rs('converter')}. ${rs('converterLine')}`} onPress={openConverter}
        style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2], minHeight: 56, borderRadius: 18, paddingHorizontal: tokens.spacing[2], paddingVertical: tokens.spacing[1], backgroundColor: colors['surface-2'] }}>
        <Glyph name="converter" size={24} color={colors.sleep} />
        <View style={{ flex: 1 }}>
          <ThemedText style={{ fontWeight: '600' }}>{rs('converter')}</ThemedText>
          <ThemedText variant="caption" muted>{rs('converterLine')}</ThemedText>
        </View>
        <Glyph name="chevron" size={18} color={colors['text-muted']} weight={2.2} />
      </Tappable>}
    </View>}

    <Block label={rs('routinesAndTime')}>
      <View style={{ backgroundColor: colors['surface-2'], borderRadius: 20, padding: tokens.spacing[2] }}>
        <TimeArc routines={routines.map((routine) => ({ id: routine.id, color: slotColor(colors, routine.color), window: routine.window }))}
          picked={new Set(draft.blockIds)} timeMin={timeMin} valueText={`${readout.big}, ${readout.sub}`} big={readout.big} sub={readout.sub}
          onTime={setTime} onStep={(by) => { const next = arcStepMinutes(timeMin ?? 12 * 60, timeMin == null ? 0 : by); if (next != null) setTime(next); }} />
      </View>
      {!!routines.length && <View accessibilityLabel={rs('routines')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[1] }}>
        {routines.map((routine) => {
          const on = draft.blockIds.includes(routine.id);
          return <Tappable key={routine.id} testID={`item-routine-${routine.id}`} accessibilityRole="checkbox" accessibilityLabel={routine.full} accessibilityState={{ checked: on }} onPress={() => pickRoutine(routine.id)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], minHeight: 44, borderRadius: 22, paddingHorizontal: tokens.spacing[2], paddingVertical: tokens.spacing[0],
              borderWidth: 1.5, borderColor: on ? colors.text : colors['hair-2'], backgroundColor: on ? colors['surface-2'] : 'transparent' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: slotColor(colors, routine.color) }} />
            <ThemedText variant="caption" style={{ fontWeight: '600', flexShrink: 1 }}>{routine.name}</ThemedText>
            {on && <Glyph name="check" size={16} color={colors.text} weight={2.4} />}
          </Tappable>;
        })}
      </View>}
      {hint?.at === 'routine' && <ErrorLine testID="item-routine-hint">{hint.text}</ErrorLine>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: tokens.spacing[1] }}>
        <ThemedText style={{ fontWeight: '600' }}>{rs('time')}</ThemedText>
        <TextInput testID="item-time" accessibilityLabel={rs('time')} value={timeText ?? draft.time} onChangeText={setTimeText} onFocus={() => setTimeText(draft.time)} onBlur={endTime} onSubmitEditing={endTime}
          placeholder={rs('routineStart')} placeholderTextColor={colors['text-muted']} keyboardType="numbers-and-punctuation" returnKeyType="done" maxLength={5} selectionColor={colors.accent}
          style={{ flexGrow: 1, flexBasis: 96, minHeight: 44, borderRadius: 12, paddingHorizontal: tokens.spacing[2], backgroundColor: colors['surface-2'], color: colors.text,
            fontSize: tokens.type.body, fontFamily: tokens.font.numeral, fontVariant: ['tabular-nums'] }} />
        <RoundButton testID="item-time-earlier" label={rs('earlier')} glyph="minus" onPress={() => stepTime(-15)} />
        <RoundButton testID="item-time-later" label={rs('later')} glyph="add" onPress={() => stepTime(15)} />
        <PillButton testID="item-time-clear" label={rs('clear')} disabled={!draft.time} onPress={() => setTime(null)} />
      </View>
      <Help>{draft.type ? rs('helpTyped') : rs('helpPlain')}</Help>
    </Block>

    {supplyOffered && <Block label={rs('onHand')}>
      <TextInput testID="item-on-hand" accessibilityLabel={rs('onHand')} value={draft.onHand} onChangeText={(text) => change({ onHand: text.replace(/[^0-9]/g, '') })}
        placeholder={rs('onHandHidden')} placeholderTextColor={colors['text-muted']} keyboardType="number-pad" maxLength={4} selectionColor={colors.accent}
        style={{ minHeight: 44, borderRadius: 12, paddingHorizontal: tokens.spacing[2], backgroundColor: colors['surface-2'], color: colors.text, fontSize: tokens.type.body, fontFamily: tokens.font.numeral }} />
      <Help>{rs('onHandHelp')}</Help>
    </Block>}

    {draft.kind === 'dose' && <Block label={rs('mixedOn')}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: tokens.spacing[1] }}>
        <ThemedText testID="item-mixed" accessibilityLiveRegion="polite" style={{ flexGrow: 1, fontWeight: '600', color: draft.mixedOn ? colors.text : colors['text-muted'] }}>
          {draft.mixedOn ? (draft.mixedOn === clock.day ? rs('today') : dayLabel(draft.mixedOn)) : rs('mixedNone')}
        </ThemedText>
        <RoundButton testID="item-mixed-earlier" label={rs('dayEarlier')} glyph="minus" onPress={() => change({ mixedOn: stepMixedDay(draft.mixedOn, -1, clock.day) })} />
        <RoundButton testID="item-mixed-later" label={rs('dayLater')} glyph="add" disabled={!draft.mixedOn || draft.mixedOn >= clock.day} onPress={() => change({ mixedOn: stepMixedDay(draft.mixedOn, 1, clock.day) })} />
        <PillButton testID="item-mixed-today" label={rs('today')} disabled={draft.mixedOn === clock.day} onPress={() => change({ mixedOn: clock.day })} />
        <PillButton testID="item-mixed-clear" label={rs('clear')} disabled={!draft.mixedOn} onPress={() => change({ mixedOn: '' })} />
      </View>
      <Help>{rs('mixedHelp')}</Help>
    </Block>}

    <View style={{ gap: tokens.spacing[1] }}>
      <ThemedText testID="item-evidence" variant="caption" muted style={{ textAlign: 'center' }}>{rs('evidence')}</ThemedText>
      <PrimaryButton testID="item-save" label={editing ? rs('save') : rs('addItem')} onPress={save} />
      {!!error && <ErrorLine testID="item-error">{error}</ErrorLine>}
      {editing && <OutlineButton testID="item-remove" label={rs('removeItem')} tone="danger" onPress={remove} />}
    </View>
  </SheetFrame>;
}

/**
 * Add item, and Edit item when it is opened with an item. The form and the
 * concentration converter are two steps of the one sheet, so going back
 * keeps everything typed.
 */
export function AddItemSheet({ itemId, type, blockId, converter = false }: { itemId?: string; type?: string; blockId?: string; converter?: boolean }) {
  const data = useRoutines();
  const { close } = useSheetClose(false);
  if (!data.view) return <SheetUnavailable testID="add-item" title={itemId ? rs('editItem') : rs('addItem')} onClose={close} />;
  if (itemId && !data.view.items.some((row) => row.id === itemId)) return <SheetUnavailable testID="add-item" title={rs('editItem')} onClose={close} />;
  return <ItemForm key={itemId ?? 'new'} data={data} view={data.view} source={{ itemId, type, blockId }} startInConverter={converter} />;
}
