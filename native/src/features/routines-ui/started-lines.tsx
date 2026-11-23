import { View } from 'react-native';
import { Card } from '@/components/card';
import { useSelectionHaptic } from '@/components/selection-haptic';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { CHART_LINES_HINT, CHART_LINES_TITLE, chartLineChoices, setCompoundChartLine, startedChartMarkers, type StartedMarker } from '@/features/routines/model/chart-lines';
import { ToggleRow } from '@/features/settings/parts';
import { routinesHomeText } from '@/i18n/en';
import { semibold } from './parts';
import { useRoutines } from './use-routines';

/* The "Started" lines on the Progress charts. A line is a day and a label the person switched on. It is drawn
   on this phone, beside readings this file never sees: a chart hands over its days and gets back the marks that
   fall on them. Nothing here sends, logs or reports a name or a day. */

/** "Nov 1", with the year when it is not this one. */
export function startedDay(day: string, now = new Date()): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 12).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year === now.getFullYear() ? {} : { year: 'numeric' }) });
}

/** The switched-on marks that fall on a chart's days, oldest first. `days` are the chart's own day keys in
 * order; a chart of weeks passes `weekly`, and a start inside a week lands on that week's first day. */
export function useStartedMarkers(days: readonly string[], weekly = false): StartedMarker[] {
  const { store } = useRoutines({ seed: false });
  return startedChartMarkers(store, days, weekly ? { bucketDays: 7 } : null);
}

/** What VoiceOver adds to a chart that carries marks: "Started X, Nov 1." for each. */
export function startedSpoken(markers: readonly StartedMarker[]): string {
  return markers.map(marker => `${routinesHomeText('startedMark', { label: marker.label, day: startedDay(marker.date) })}.`).join(' ');
}

/** Under a chart: one line of text for each mark, in the order the lines stand on the chart, each beside a
 * small upright stroke like the one drawn. Text stays outside the drawing so it grows with the text size. */
export function StartedLegend({ markers, testID }: { markers: readonly StartedMarker[]; testID?: string }) {
  const { colors } = useTheme();
  if (!markers.length) return null;
  return <View testID={testID} style={{ gap: 2 }}>
    {markers.map(marker => <View key={`${marker.date} ${marker.label}`} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1] }}>
      <View style={{ width: 2, alignSelf: 'stretch', marginVertical: 2, borderRadius: 1, backgroundColor: colors['text-muted'] }} />
      <ThemedText variant="caption" muted style={{ flex: 1 }}>{routinesHomeText('startedMark', { label: marker.label, day: startedDay(marker.date) })}</ThemedText>
    </View>)}
  </View>;
}

/** The card that turns the lines on, one switch for each thing that has a start day. Every switch starts off.
 * It draws nothing until there is something to switch. */
export function StartedLinesCard({ testID = 'started-lines' }: { testID?: string }) {
  const routines = useRoutines({ seed: false }), haptic = useSelectionHaptic();
  const { colors } = useTheme();
  const choices = chartLineChoices(routines.store);
  if (!choices.length) return null;
  return <Card testID={testID} style={{ borderRadius: 18, gap: 0 }}>
    <ThemedText variant="headline" accessibilityRole="header" style={semibold}>{CHART_LINES_TITLE}</ThemedText>
    <ThemedText variant="caption" muted style={{ marginTop: tokens.spacing[0], marginBottom: tokens.spacing[1] }}>{CHART_LINES_HINT}</ThemedText>
    {choices.map((choice, index) => <View key={choice.compoundId} style={{ borderTopWidth: index ? 1 : 0, borderTopColor: colors.hair }}>
      <ToggleRow testID={`started-line-${choice.compoundId}`} label={choice.label} hint={routinesHomeText('startedSince', { day: startedDay(choice.startDate) })} value={choice.on}
        onValueChange={(on) => { if (routines.apply((store, clock) => setCompoundChartLine(store, choice.compoundId, on, clock))) haptic(); }} />
    </View>)}
  </Card>;
}
