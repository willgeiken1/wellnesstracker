import { useState } from 'react';
import { AccessibilityInfo, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelectionHaptic } from '@/components/selection-haptic';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { formatRoutineAmount, loggedAmountText, parseRoutineAmount, shiftRoutineDay } from '@/features/routines/model/day';
import {
  LOGGED_AMOUNTS_HINT, LOG_DETAILS_REFUSED, LOG_TIME_HINT, SAME_SITE_HINT, SAME_SITE_WARNING, SITE_OPTIONAL_HINT,
  compoundDoseHistory, editLog, formatHistoryDay, historyStatus, logDraft, logTimeEditable, sameSiteWarning, type LogDraft,
} from '@/features/routines/model/edit-log';
import { routineShows } from '@/features/routines/model/setup';
import { ROUTINE_SITES, lastRoutineSite, routineSiteLabel, type RoutineItem, type RoutineLog } from '@/features/routines/model/shape';
import { routinesText } from '@/i18n/en';
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
  return <Tappable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
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
          return <Tappable key={site.id || 'none'} testID={`log-site-${site.id || 'none'}`} accessibilityRole="radio" accessibilityLabel={site.label} accessibilityState={{ checked: on }}
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

/** The earlier logs of an item, each with the amount stored on it. */
function ItemHistory({ logs }: { logs: readonly RoutineLog[] }) {
  const { colors } = useTheme();
  return <Panel style={{ gap: 0 }}>
    <ThemedText variant="headline" accessibilityRole="header">{routinesText('itemHistory')}</ThemedText>
    {!logs.length && <Note>{routinesText('itemHistoryEmpty')}</Note>}
    {logs.slice(0, 30).map((log, index) => {
      const amount = loggedAmountText(log);
      return <View key={log.id} testID="item-history-row" accessible style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], borderTopWidth: index ? 1 : 0, borderTopColor: colors.hair }}>
        <ThemedText numeric style={{ flex: 1 }}>{formatHistoryDay(log.day)}</ThemedText>
        <ThemedText variant="caption" muted numeric>{[historyStatus(log), amount].filter(Boolean).join(' · ')}</ThemedText>
      </View>;
    })}
    {logs.some(log => !!loggedAmountText(log)) && <Note>{LOGGED_AMOUNTS_HINT}</Note>}
  </Panel>;
}

/** One item: its log for the day to edit when it has one, the ways on to the item's own form and the
 * converter, and its history. A dose item ends with the line about checking with a doctor. */
export function ItemDetails({ itemId, logId }: { itemId: string; logId?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const routines = useRoutines(), now = useMinuteClock();
  const { view, store } = routines;
  const item: RoutineItem | null = view.items.find(row => row.id === itemId) ?? null;
  const opened = logId ? logDraft(store, logId, routines.dayOf(now)) : null;
  const dose = item ? item.kind === 'dose' : opened?.kind === 'dose';
  const sites = dose && (routineShows('injection', store) || item?.type === 'peptide');
  const name = item?.name ?? opened?.itemName ?? '';
  const history = item
    ? (item.compoundId ? compoundDoseHistory(store, item.compoundId) : view.logs.filter(log => log.itemId === item.id && log.rest !== true).slice().sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0)))
    : [];
  const intro = !opened ? routinesText(dose ? 'detailsOpenDose' : 'detailsOpenCheck')
    : opened.skipped ? routinesText('detailsSkipped') : opened.kind === 'check' ? routinesText('detailsCheck') : '';
  return <ScrollView testID="routine-details" style={{ flex: 1, backgroundColor: colors.bg }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
    contentContainerStyle={{ padding: tokens.spacing[3], paddingBottom: tokens.spacing[3] + insets.bottom, gap: tokens.spacing[2] }}>
    <SheetHeader title={name || routinesText('detailsTitle')} close={routinesText('close')} onClose={() => router.back()} />
    {!item && !opened && <ThemedText muted>{routinesText('itemGone')}</ThemedText>}
    {!!intro && (item || opened) && <ThemedText muted>{intro}</ThemedText>}
    {/* A new log gets a fresh form, so nothing typed for one log shows on another. */}
    {opened && <LogForm key={opened.logId} routines={routines} opened={opened} dose={!!dose} sites={!!sites} />}
    {item && <View style={{ borderRadius: CARD_RADIUS, gap: tokens.spacing[1] }}>
      <TextButton testID="details-edit-item" label={routinesText('editItem')} onPress={() => router.push(routineRoutes.editItem(item.id))} color={colors.text} pill />
      {dose && item.type === 'peptide' && routineShows('calculator', store) && <>
        <TextButton testID="details-converter" label={routinesText('converter')} onPress={() => router.push(routineRoutes.converter(item.id))} color={colors.text} pill />
        <Note>{routinesText('converterHint')}</Note>
      </>}
    </View>}
    {item && <ItemHistory logs={history} />}
    {dose && (item || opened) && <Note testID="details-doctor">{routinesText('doctor')}</Note>}
  </ScrollView>;
}
