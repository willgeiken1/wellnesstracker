import { View } from 'react-native';
import { router } from 'expo-router';
import { useLayoutMotion } from '@/components/layout-motion';
import { Screen } from '@/components/screen';
import { useSelectionHaptic } from '@/components/selection-haptic';
import { ThemedText } from '@/components/themed-text';
import { tokens } from '@/design/tokens';
import { setDayRollover } from '@/features/routines/model/actions';
import { MAX_DAY_ROLLOVER_HOUR } from '@/features/routines/model/dose';
import { addRoutinePart, routineParts, routineShows, toggleFocus, type RoutinePart } from '@/features/routines/model/setup';
import { routineClock24 } from '@/features/routines/model/types';
import { ChoiceChips, Group, InfoRow, NavRow, SectionLabel, ToggleRow } from '@/features/settings/parts';
import { routinesText, type RoutinesTabKey } from '@/i18n/en';
import { converterInBuild, converterShown } from './converter-shown';
import { routineRoutes } from './entry-points';
import { Note, TextButton, semibold } from './parts';
import { useRoutines } from './use-routines';

const HOURS = Array.from({ length: MAX_DAY_ROLLOVER_HOUR + 1 }, (_, hour) => ({ value: hour, label: routineClock24(hour * 60) }));
/** The questions, in the order they are listed. */
export const ROUTINE_FAQ: readonly (readonly [RoutinesTabKey, RoutinesTabKey])[] = [
  ['faqWhatQ', 'faqWhatA'], ['faqWhoQ', 'faqWhoA'], ['faqLogQ', 'faqLogA'], ['faqCountQ', 'faqCountA'],
  ['faqStreakQ', 'faqStreakA'], ['faqEditQ', 'faqEditA'], ['faqConverterQ', 'faqConverterA'], ['faqRemindQ', 'faqRemindA'],
];
/** On iPhone the tool is the converter, and a rest day is logged from the top of the page. */
const PART_LABEL: Partial<Record<string, RoutinesTabKey>> = { calculator: 'converter' };
const PART_HINT: Partial<Record<string, RoutinesTabKey>> = { calculator: 'partConverterHint', enhancers: 'partEnhancersHint', rest: 'partRestHint' };
export const partLabel = (part: RoutinePart) => (PART_LABEL[part.key] ? routinesText(PART_LABEL[part.key] as RoutinesTabKey) : part.label);
/* In a build with the converter cut, the line for the Peptides and Enhancers tabs does not name it either. */
export const partHint = (part: RoutinePart) => (part.key === 'enhancers' && !converterInBuild() ? routinesText('partEnhancersHintPlain')
  : PART_HINT[part.key] ? routinesText(PART_HINT[part.key] as RoutinesTabKey) : part.hint);
/** The parts Settings offers and the questions it lists. With the converter cut, neither names it. */
const CONVERTER_PART = 'calculator';
const CONVERTER_FAQ: RoutinesTabKey = 'faqConverterQ';

/** Routines settings: Focus mode, the hour a new day starts, what can be added to the page, the setup quiz
 * and the questions people ask. */
export function RoutinesSettings() {
  const routines = useRoutines(), haptic = useSelectionHaptic(), glide = useLayoutMotion();
  const { store, view } = routines;
  const missing = routineParts(store, feature => routineShows(feature, store)).filter(part => !part.present && (part.key !== CONVERTER_PART || converterInBuild()));
  const converter = converterShown(store);
  const faq = ROUTINE_FAQ.filter(([question]) => question !== CONVERTER_FAQ || converterInBuild());
  return <Screen title={routinesText('settings')}>
    <Group testID="routines-settings-focus">
      <ToggleRow testID="routines-focus" label={routinesText('focus')} hint={routinesText('focusNote')} value={view.prefs.focusMode === true}
        onValueChange={() => { if (routines.apply((current, clock) => toggleFocus(current, clock))) haptic(); }} />
      <InfoRow label={routinesText('rollover')} hint={routinesText('rolloverNote')}>
        <ChoiceChips options={HOURS} value={view.settings.dayRolloverHour}
          onChange={(hour) => { if (hour !== view.settings.dayRolloverHour && routines.apply((current, clock) => setDayRollover(current, hour, clock))) haptic(); }} />
      </InfoRow>
    </Group>
    {converter && <Note testID="routines-converter-note">{routinesText('converterNote')}</Note>}
    <Note testID="routines-doctor">{routinesText('doctor')}</Note>

    <SectionLabel>{routinesText('addToPage')}</SectionLabel>
    {missing.length
      ? <Group testID="routines-parts">
        {missing.map(part => <View key={part.key} style={{ minHeight: 52, paddingVertical: tokens.spacing[1], flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1] }}>
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText style={semibold}>{partLabel(part)}</ThemedText>
            {!!partHint(part) && <Note>{partHint(part)}</Note>}
          </View>
          <TextButton testID={`routines-add-${part.key}`} label={routinesText('add')} spoken={routinesText('addPart', { name: partLabel(part) })} pill
            onPress={() => { glide(); routines.apply((current, clock) => addRoutinePart(current, part.key, clock)); }} />
        </View>)}
      </Group>
      : <Note testID="routines-all-added">{routinesText('allAdded')}</Note>}

    {/* Routines are not synced and a backup cannot put them back yet, so the page says so before it matters. */}
    <SectionLabel>{routinesText('phoneOnlyTitle')}</SectionLabel>
    <Note testID="routines-phone-only">{routinesText('phoneOnlyNote')}</Note>

    <SectionLabel>{routinesText('setUpPage')}</SectionLabel>
    <Group><NavRow testID="routines-retake" label={routinesText('retake')} onPress={() => router.push(routineRoutes.setup('retake'))} /></Group>

    <SectionLabel>{routinesText('faq')}</SectionLabel>
    <Note testID="routines-faq-doctor">{routinesText('doctor')}</Note>
    <View testID="routines-faq" style={{ gap: tokens.spacing[2] }}>
      {faq.map(([question, answer]) => <View key={question} style={{ gap: tokens.spacing[0] }}>
        <ThemedText accessibilityRole="header" style={semibold}>{routinesText(question)}</ThemedText>
        <ThemedText muted>{routinesText(answer)}</ThemedText>
      </View>)}
    </View>
  </Screen>;
}
