import { View } from 'react-native';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { SERVICES, WIDGETS, type ServiceId } from '@/features/home-widgets/registry';
import { t } from '@/i18n/en';

const card = { borderRadius: 18, padding: tokens.spacing[3], gap: tokens.spacing[1] } as const;
const semibold = { fontWeight: '600' } as const;

const NAMES: Record<ServiceId | 'insight', string> = { oura: 'Oura', appleHealth: 'Apple Health', fitbit: 'Fitbit', whoop: 'WHOOP', insight: 'Insight' };
const PILLAR: Record<ServiceId | 'insight', 'training' | 'food' | 'sleep'> = { oura: 'sleep', appleHealth: 'food', fitbit: 'training', whoop: 'sleep', insight: 'training' };
/** What each service adds, read from the Home widget catalogue so the two never drift apart. */
export const unlocks = (service: ServiceId) => WIDGETS.filter(widget => (widget.services as readonly ServiceId[]).includes(service)).map(widget => widget.title);
/** A service is ready to connect once at least one of its widgets is built. */
export const ready = (service: ServiceId) => WIDGETS.some(widget => widget.available && (widget.services as readonly ServiceId[]).includes(service));

/** Made-up numbers that show how one day reads when several services feed it. Never real data. */
export const EXAMPLE_DAY: readonly { label: string; value: string; sources: readonly (ServiceId | 'insight')[]; note?: string }[] = [
  { label: 'Sleep', value: '7 h 12 min', sources: ['oura', 'appleHealth'], note: 'Oura 7 h 12 min · Apple Health 7 h 05 min. Insight uses the ring you wear to bed.' },
  { label: 'Recovery', value: '82%', sources: ['whoop'] },
  { label: 'Heart rate variability', value: '48 ms', sources: ['oura'] },
  { label: 'Resting heart rate', value: '54 bpm', sources: ['oura', 'whoop'] },
  { label: 'Steps', value: '8,430', sources: ['appleHealth', 'fitbit'] },
  { label: 'Training', value: '12,400 lb', sources: ['insight'] },
  { label: 'Food', value: '2,180 kcal', sources: ['insight'] },
];

function Badge({ source }: { source: ServiceId | 'insight' }) {
  const { colors, mode } = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, minHeight: 22, borderRadius: 99, backgroundColor: colors['surface-2'] }}>
    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tokens.color.pillar[PILLAR[source]][mode] }} />
    <ThemedText variant="caption">{NAMES[source]}</ThemedText>
  </View>;
}

function Monogram({ service }: { service: ServiceId }) {
  const { colors, mode } = useTheme();
  return <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors['surface-2'] }}>
    <ThemedText style={[semibold, { color: tokens.color.pillar[PILLAR[service]][mode] }]}>{NAMES[service].charAt(0)}</ThemedText>
  </View>;
}

/** Health & devices: which services Insight can bring together and what one combined day looks like.
 * A preview only. It connects nothing, stores nothing and reads no health data; the example numbers are made up. */
export function ConnectedServices({ connected = [] }: { connected?: readonly ServiceId[] }) {
  const { colors } = useTheme();
  return <View style={{ gap: tokens.spacing[3] }}>
    <View style={{ gap: tokens.spacing[0] }}>
      <ThemedText variant="title" accessibilityRole="header" style={semibold}>{t('connectTitle')}</ThemedText>
      <ThemedText muted>{t('connectBody')}</ThemedText>
    </View>
    <Card style={[card, { gap: 0, paddingVertical: tokens.spacing[1] }]} testID="connect-services">
      {SERVICES.map((service, index) => {
        const adds = unlocks(service), state = connected.includes(service) ? 'connectOn' : ready(service) ? 'connectOff' : 'connectLater';
        return <View key={service} testID={`connect-${service}`} accessible accessibilityLabel={`${NAMES[service]}, ${t(state)}. ${t('connectAdds')} ${adds.join(', ')}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2], paddingVertical: tokens.spacing[2], borderTopWidth: index ? 1 : 0, borderTopColor: colors['surface-2'] }}>
          <Monogram service={service} />
          <View style={{ flex: 1 }}>
            <ThemedText variant="headline">{NAMES[service]}</ThemedText>
            <ThemedText muted variant="caption">{adds.join(' · ')}</ThemedText>
          </View>
          <View style={{ paddingHorizontal: 10, minHeight: 26, borderRadius: 99, justifyContent: 'center', backgroundColor: state === 'connectOn' ? colors['accent-tint'] : colors['surface-2'] }}>
            <ThemedText variant="caption" style={[semibold, state === 'connectOn' ? { color: colors.accent } : { color: colors['text-muted'] }]}>{t(state)}</ThemedText>
          </View>
        </View>;
      })}
    </Card>
    <ThemedText muted variant="caption">{t('connectSoon')}</ThemedText>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1] }}>
      <ThemedText variant="headline" accessibilityRole="header" style={[semibold, { flex: 1 }]}>{t('connectDayTitle')}</ThemedText>
      <View style={{ paddingHorizontal: 10, minHeight: 24, borderRadius: 99, justifyContent: 'center', backgroundColor: colors['surface-2'] }}>
        <ThemedText muted variant="caption">{t('exampleOnly')}</ThemedText>
      </View>
    </View>
    <Card style={[card, { gap: 0, paddingVertical: tokens.spacing[1] }]} testID="connect-example-day">
      {EXAMPLE_DAY.map((row, index) => <View key={row.label} style={{ paddingVertical: tokens.spacing[2], gap: 6, borderTopWidth: index ? 1 : 0, borderTopColor: colors['surface-2'] }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <ThemedText style={{ flex: 1 }}>{row.label}</ThemedText>
          <ThemedText numeric style={semibold}>{row.value}</ThemedText>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{row.sources.map(source => <Badge key={source} source={source} />)}</View>
        {row.note && <ThemedText muted variant="caption">{row.note}</ThemedText>}
      </View>)}
    </Card>
    <Card style={card} testID="connect-example-pattern">
      <ThemedText muted variant="caption">{t('connectPatternLabel')}</ThemedText>
      <ThemedText>{t('connectPattern')}</ThemedText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}><Badge source="oura" /><Badge source="insight" /></View>
    </Card>
    <ThemedText muted variant="caption">{t('connectPrivacy')}</ThemedText>
  </View>;
}
