import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayoutMotion } from '@/components/layout-motion';
import { useSelectionHaptic } from '@/components/selection-haptic';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { logItem, skipItem, undoLog } from '@/features/routines/model/actions';
import { coveringLog, formatRoutineAmount, loggedAmountText, parseRoutineAmount, shiftRoutineDay } from '@/features/routines/model/day';
import {
  LOGGED_AMOUNTS_HINT, LOG_DETAILS_REFUSED, LOG_TIME_HINT, SAME_SITE_HINT, SAME_SITE_WARNING, SITE_OPTIONAL_HINT,
  compoundDoseHistory, editLog, formatHistoryDay, historyStatus, logDraft, logTimeEditable, sameSiteWarning, type LogDraft,
} from '@/features/routines/model/edit-log';
import { routineShows } from '@/features/routines/model/setup';
import { routineSupplyView } from '@/features/routines/model/supply';
import { ROUTINE_SITES, lastRoutineSite, routineSiteLabel, type RoutineItem, type RoutineLog } from '@/features/routines/model/shape';
import { routinesText } from '@/i18n/en';
import { converterShown } from './converter-shown';
import { routineRoutes } from './entry-points';
import { Glyph } from './glyph';
import { CARD_RADIUS, FieldLabel, Note, Panel, PrimaryButton, RoundButton, SheetHeader, TextButton, semibold } from './parts';
import { useMinuteClock, useRoutines, type Routines } from './use-routines';

const QUARTER = 0.25;

/** A text field on a card: its label above, the value in a well. */
function Field({ label, value, onChange, numeric = false, multiline = false, testID }: {
  label: string; value: string; onChange: (text: string) => void; numeric?: boolean; multiline?: boolean; testID: string;
}) {
  const { colors } = useTheme();
  return <View style={{ gap: tokens.spacing[0] }}>
    <FieldLabel>{label}</FieldLabel>
    <TextInput testID={testID} accessibilityLabel={label} value={value} onChangeText={onChange} multiline={multiline}
      keyboardType={numeric ? 'decimal-pad' : 'default'} allowFontScaling maxFontSizeMultiplier={0}
      style={{ minHeight: 48, borderRadius: 12, paddingHorizontal: tokens.spacing[2], paddingVertical: tokens.spacing[1], backgroundColor: colors['surface-2'], color: colors.text,
        fontSize: tokens.type.body, fontFamily: numeric ? tokens.font.numeral : undefined, textAlignVertical: multiline ? 'top' : 'center' }} />
  </View>;
}

/** A step button under the amount: a quarter up or down. */
function Step({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return <Tappable dim="fill" testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={{ flex: 1, minHeight: 44, borderRadius: 22, paddingHorizontal: tokens.spacing[2], alignItems: 'center', justifyContent: 'center', backgroundColor: colors['surface-2'] }}>
    <ThemedText variant="caption" style={[semibold, { textAlign: 'center' }]}>{label}</ThemedText>
  </Tappable>;
}

/** The form for one saved log: amount, day, time, note and site, each as the log holds it. */
function LogForm({ routines, opened, dose, sites }: { routines: Routines; opened: LogDraft; dose: boolean; sites: boolean }) {
  const { colors } = useTheme();
  const haptic = useSelectionHaptic();
  const [draft, setDraft] = useState(opened);
  const [dismissed, setDismissed] = useState('');
  const lastSite = opened.itemId ? lastRoutineSite(routines.store, opened.itemId, opened.logId) : '';
  const set = (patch: Partial<LogDraft>) => setDraft(current => ({ ...current, ...patch, error: '' }));
  const step = (delta: number) => {
    const amount = parseRoutineAmount(draft.amount) ?? 0, next = Math.round((amount + delta) * 10000) / 10000;
    if (next > 0) set({ amount: formatRoutineAmount(next) || String(next) });
  };
  const moveDay = (delta: number) => {
    const next = shiftRoutineDay(draft.day, delta);
    if (next && next <= draft.maxDay && next !== draft.day) { haptic(); set({ day: next }); }
  };
  const save = () => {
    const edit = dose && !draft.skipped
      ? { amount: draft.amount, day: draft.day, time: draft.time, note: draft.note, ...(sites ? { site: draft.site } : {}) }
      : { day: draft.day, time: draft.time, note: draft.note };
    const saved = routines.apply((store, clock) => editLog(store, draft.logId, edit, clock)?.store ?? null);
    if (!saved) { setDraft(current => ({ ...current, error: LOG_DETAILS_REFUSED })); return; }
    AccessibilityInfo.announceForAccessibility(routinesText('logUpdated'));
    router.back();
  };
  const warn = sites && sameSiteWarning({ site: draft.site, lastSite, siteDismissed: dismissed });
  const pickSite = (id: string) => { if (id !== draft.site) haptic(); set({ site: id }); };
  return <>
    <Panel style={{ gap: tokens.spacing[2] }}>
      {dose && !draft.skipped && <>
        <Field testID="log-amount" label={routinesText('amount')} value={draft.amount} onChange={amount => set({ amount })} numeric />
        <View accessibilityLabel={routinesText('amountSteps')} style={{ flexDirection: 'row', gap: tokens.spacing[1] }}>
          <Step testID="log-amount-less" label={routinesText('takeQuarter')} onPress={() => step(-QUARTER)} />
          <Step testID="log-amount-more" label={routinesText('addQuarter')} onPress={() => step(QUARTER)} />
        </View>
        {!!draft.unit && <Note>{routinesText('unitLine', { unit: draft.unit })}</Note>}
      </>}
      <View style={{ gap: tokens.spacing[0] }}>
        <FieldLabel>{routinesText('day')}</FieldLabel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1] }}>
          <RoundButton testID="log-day-earlier" glyph="back" label={routinesText('dayEarlier')} onPress={() => moveDay(-1)} />
          <ThemedText testID="log-day" numeric accessibilityLiveRegion="polite" style={{ flex: 1, textAlign: 'center' }}>{formatHistoryDay(draft.day)}</ThemedText>
          <RoundButton testID="log-day-later" glyph="forward" label={routinesText('dayLater')} onPress={() => moveDay(1)} disabled={draft.day >= draft.maxDay} />
        </View>
      </View>
      {logTimeEditable(draft.day, draft.maxDay) && <>
        <Field testID="log-time" label={routinesText('time')} value={draft.time} onChange={time => set({ time })} />
        <Note>{LOG_TIME_HINT}</Note>
      </>}
      <Field testID="log-note" label={routinesText('note')} value={draft.note} onChange={note => set({ note })} multiline />
    </Panel>
    {sites && dose && !draft.skipped && <Panel style={{ gap: tokens.spacing[1] }}>
      <FieldLabel>{routinesText('site')}</FieldLabel>
      <Note>{lastSite ? routinesText('lastSite', { site: routineSiteLabel(lastSite) }) : routinesText('noSiteYet')}</Note>
      <View accessibilityRole="radiogroup" accessibilityLabel={routinesText('site')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[1] }}>
        {[{ id: '', label: routinesText('noSite') }, ...ROUTINE_SITES].map((site) => {
          const on = draft.site === site.id;
          return <Tappable dim="fill" key={site.id || 'none'} testID={`log-site-${site.id || 'none'}`} accessibilityRole="radio" accessibilityLabel={site.label} accessibilityState={{ checked: on }}
            onPress={() => pickSite(site.id)}
            style={{ flexGrow: 1, flexBasis: site.id ? '45%' : '100%', minHeight: 48, borderRadius: 14, paddingHorizontal: tokens.spacing[2], paddingVertical: tokens.spacing[0], justifyContent: 'center',
              backgroundColor: on ? colors.accent : colors['surface-2'] }}>
            <ThemedText style={[{ color: on ? colors['on-accent'] : colors.text, textAlign: 'center' }, on && semibold]}>{site.label}</ThemedText>
          </Tappable>;
        })}
      </View>
      <Note>{SITE_OPTIONAL_HINT}</Note>
      {warn && <View testID="log-site-warning" accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], borderRadius: 14, padding: tokens.spacing[1], backgroundColor: colors['surface-2'] }}>
        <Glyph name="warning" color={colors.warning} />
        <View style={{ flex: 1 }}>
          <ThemedText style={semibold}>{SAME_SITE_WARNING}</ThemedText>
          <Note>{SAME_SITE_HINT}</Note>
        </View>
        <TextButton testID="log-site-dismiss" label={routinesText('dismiss')} onPress={() => setDismissed(draft.site)} />
      </View>}
    </Panel>}
    {!!draft.error && <ThemedText testID="log-error" accessibilityRole="alert" style={{ color: colors.danger }}>{draft.error}</ThemedText>}
    <PrimaryButton testID="log-save" label={routinesText('save')} onPress={save} />
  </>;
}

/** The earlier logs of an item, each with the amount stored on it. A row opens its log in the form above, so a
 * log from any earlier day can be corrected, not only today's. */
function ItemHistory({ logs, openId, onOpen }: { logs: readonly RoutineLog[]; openId: string; onOpen: (log: RoutineLog) => void }) {
  const { colors } = useTheme();
  return <Panel style={{ gap: 0 }}>
    <ThemedText variant="headline" accessibilityRole="header">{routinesText('itemHistory')}</ThemedText>
    {!logs.length && <Note>{routinesText('itemHistoryEmpty')}</Note>}
    {logs.slice(0, 30).map((log, index) => {
      const amount = loggedAmountText(log), day = formatHistoryDay(log.day), state = [historyStatus(log), amount].filter(Boolean).join(' · ');
      const on = log.id === openId;
      return <Tappable key={log.id} testID={`details-history-${log.id}`} accessibilityRole="button" accessibilityLabel={[day, historyStatus(log), amount].filter(Boolean).join(', ')}
        accessibilityHint={routinesText('opensLog')} accessibilityState={{ selected: on }} onPress={() => onOpen(log)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], paddingVertical: tokens.spacing[0], borderTopWidth: index ? 1 : 0, borderTopColor: colors.hair }}>
        <ThemedText numeric style={[{ flex: 1 }, on && semibold]}>{day}</ThemedText>
        <ThemedText variant="caption" muted numeric>{state}</ThemedText>
        <Glyph name="forward" size={16} color={colors['text-muted']} />
      </Tappable>;
    })}
    {logs.some(log => !!loggedAmountText(log)) && <Note>{LOGGED_AMOUNTS_HINT}</Note>}
  </Panel>;
}

/** One item. With nothing logged today it offers Log and Skip, so an item that sits on a type tab and in no
 * routine can still be logged. With a log open it is the form for that log, with Undo: today's log by default,
 * or the one opened from History or from the list below. Then the ways on to the item's own form and the
 * converter, its supply line and its history. A dose item ends with the line about checking with a doctor. */
export function ItemDetails({ itemId, logId }: { itemId: string; logId?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const haptic = useSelectionHaptic(), glide = useLayoutMotion();
  const routines = useRoutines(), now = useMinuteClock();
  const { view, store } = routines, today = routines.dayOf(now);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [picked, setPicked] = useState(logId ?? '');
  const [refused, setRefused] = useState(false);
  const item: RoutineItem | null = view.items.find(row => row.id === itemId) ?? null;
  const todayLog = item ? coveringLog(view.logs, item.id, today) : null;
  const opened = (picked ? logDraft(store, picked, today) : null) ?? (todayLog ? logDraft(store, todayLog.id, today) : null);
  // An item can change kind after it was logged. An open log keeps the kind it was saved with, so an earlier
  // dose log still shows its amount and site; the item's own kind speaks only where there is no log.
  const itemDose = item?.kind === 'dose';
  const dose = opened ? opened.kind === 'dose' : itemDose;
  const sites = dose && (routineShows('injection', store) || item?.type === 'peptide');
  const name = item?.name ?? opened?.itemName ?? '';
  const history = item
    ? (item.compoundId ? compoundDoseHistory(store, item.compoundId) : view.logs.filter(log => log.itemId === item.id && log.rest !== true).slice().sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0)))
    : [];
  const supply = item ? routineSupplyView({ item, logs: view.logs, today }).text : '';
  const intro = !opened ? routinesText(dose ? 'detailsOpenDose' : 'detailsOpenCheck')
    : routinesText(opened.skipped ? 'detailsSkipped' : opened.kind === 'check' ? 'detailsCheck' : 'detailsDose');
  /* An item removed from its own form leaves nothing here to show, so the sheet under that form closes too. */
  const seen = useRef(false);
  useEffect(() => {
    if (item) seen.current = true;
    else if (seen.current && !opened) { seen.current = false; router.back(); }
  }, [item, opened]);
  const act = (change: Parameters<Routines['apply']>[0], said: string) => {
    // Logging, skipping and undoing swap the buttons for the log's form or back, so the sheet glides to its new shape.
    glide();
    if (!routines.apply(change)) { setRefused(true); return; }
    setRefused(false); haptic();
    AccessibilityInfo.announceForAccessibility(said);
  };
  const open = (log: RoutineLog) => {
    if (log.id !== opened?.logId) haptic();
    setPicked(log.id); setRefused(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
    AccessibilityInfo.announceForAccessibility(routinesText('logOpened', { day: formatHistoryDay(log.day) }));
  };
  return <ScrollView ref={scroll} testID="routine-details" style={{ flex: 1, backgroundColor: colors.bg }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
    contentContainerStyle={{ padding: tokens.spacing[3], paddingBottom: tokens.spacing[3] + insets.bottom, gap: tokens.spacing[2] }}>
    <SheetHeader title={name || routinesText('detailsTitle')} close={routinesText('close')} onClose={() => router.back()} />
    {!item && !opened && <ThemedText muted>{routinesText('itemGone')}</ThemedText>}
    {!!intro && (item || opened) && <ThemedText testID="details-intro" muted>{intro}</ThemedText>}
    {!!supply && <ThemedText testID="details-supply" variant="caption" numeric style={semibold}>{supply}</ThemedText>}
    {item && !opened && <View style={{ gap: tokens.spacing[0] }}>
      <PrimaryButton testID="details-log" label={routinesText('logThis')} onPress={() => act((current, clock) => logItem(current, item.id, clock), routinesText('loggedToday'))} />
      <TextButton testID="details-skip" label={routinesText('skip')} onPress={() => act((current, clock) => skipItem(current, item.id, clock), routinesText('skippedToday'))} color={colors.text} pill />
    </View>}
    {/* A new log gets a fresh form, so nothing typed for one log shows on another. */}
    {opened && <LogForm key={opened.logId} routines={routines} opened={opened} dose={!!dose} sites={!!sites} />}
    {opened && <TextButton testID="details-undo" label={routinesText('undoLog')} color={colors.text} pill
      onPress={() => { setPicked(''); act((current, clock) => undoLog(current, opened.logId, clock), routinesText('logUndone')); }} />}
    {refused && <ThemedText testID="details-refused" accessibilityRole="alert" style={{ color: colors.danger }}>{routinesText('couldNotSave')}</ThemedText>}
    {item && <View style={{ borderRadius: CARD_RADIUS, gap: tokens.spacing[1] }}>
      <TextButton testID="details-edit-item" label={routinesText('editItem')} onPress={() => router.push(routineRoutes.editItem(item.id))} color={colors.text} pill />
      {itemDose && item.type === 'peptide' && converterShown(store) && <>
        <TextButton testID="details-converter" label={routinesText('converter')} onPress={() => router.push(routineRoutes.converter(item.id))} color={colors.text} pill />
        <Note>{routinesText('converterHint')}</Note>
      </>}
    </View>}
    {item && <ItemHistory logs={history} openId={opened?.logId ?? ''} onOpen={open} />}
    {(dose || itemDose) && <Note testID="details-doctor">{routinesText('doctor')}</Note>}
  </ScrollView>;
}
