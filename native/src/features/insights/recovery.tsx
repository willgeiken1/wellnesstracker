import { View } from 'react-native';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import type { Night, Recovery as RecoveryData } from '@/features/health/recovery';
import type { HealthAccess } from '@/features/health/source';
import { t } from '@/i18n/en';
import { MiniChart } from './mini-chart';

const semibold = { fontWeight: '600' } as const;
const hours = (minutes: number) => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
const short = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const dayLabel = (back: number, now: Date) => short(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back));
const latest = (values: (number | null)[] | null) => values ? [...values].reverse().find((v): v is number => v !== null) ?? null : null;
const mean = (values: (number | null)[]) => { const known = values.filter((v): v is number => v !== null); return known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : null; };

function Message({ title, body, testID }: { title: string; body: string; testID: string }) {
  return <Card testID={testID}>
    <ThemedText variant="headline" accessibilityRole="header">{title}</ThemedText>
    <ThemedText muted>{body}</ThemedText>
  </Card>;
}

/** Last night as one bar split by stage, with the minutes of each underneath. Plain asleep shows only when a device
 * recorded no stages. */
function NightCard({ night }: { night: Night }) {
  const { colors } = useTheme();
  const parts = ([['deep', t('recoveryDeep'), colors.sleep, 1], ['core', t('recoveryCore'), colors.sleep, 0.6], ['rem', t('recoveryRem'), colors.sleep, 0.35],
    ['asleep', t('recoveryAsleep'), colors.sleep, 0.6], ['awake', t('recoveryAwake'), colors['text-muted'], 0.35]] as const).filter(([key]) => night[key] > 0);
  const asleep = night.deep + night.core + night.rem + night.asleep, total = asleep + night.awake;
  const label = `${t('recoveryLastNight')}. ${hours(asleep)} ${t('recoveryAsleepSuffix')}. ${parts.map(([key, name]) => `${name} ${hours(night[key])}`).join(', ')}`;
  return <Card testID="recovery-night" accessible accessibilityRole="image" accessibilityLabel={label} style={{ gap: tokens.spacing[1] }}>
    <ThemedText variant="headline" style={semibold}>{t('recoveryLastNight')}</ThemedText>
    <ThemedText numeric>{`${hours(asleep)} ${t('recoveryAsleepSuffix')}`}</ThemedText>
    <View style={{ flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: colors['surface-2'] }}>
      {parts.map(([key, , color, opacity]) => <View key={key} testID={`recovery-stage-${key}`} style={{ flex: night[key] / total, backgroundColor: color, opacity }} />)}
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: tokens.spacing[3] }}>
      {parts.map(([key, name]) => <ThemedText key={key} muted numeric variant="caption">{`${name} ${hours(night[key])}`}</ThemedText>)}
    </View>
  </Card>;
}

function DailyCard({ testID, title, unit, values, color, now }: { testID: string; title: string; unit: string; values: (number | null)[]; color: string; now: Date }) {
  const last = latest(values), average = mean(values);
  const summary = last === null ? t('recoveryNone') : `${t('recoveryLatest')} ${last} ${unit} · ${t('recoveryWeekAverage')} ${average} ${unit}`;
  return <Card testID={testID} accessible accessibilityRole="image" accessibilityLabel={`${title}. ${summary}`} style={{ gap: tokens.spacing[1] }}>
    <ThemedText variant="headline" style={semibold}>{title}</ThemedText>
    <ThemedText muted numeric variant="caption">{summary}</ThemedText>
    {last !== null && <MiniChart values={values} color={color} first={dayLabel(values.length - 1, now)} last={dayLabel(0, now)} height={90} />}
  </Card>;
}

function Line({ testID, title, value }: { testID: string; title: string; value: string }) {
  return <Card testID={testID} accessible accessibilityLabel={`${title}. ${value}`} style={{ gap: tokens.spacing[1] }}>
    <ThemedText variant="headline" style={semibold}>{title}</ThemedText>
    <ThemedText muted numeric variant="caption">{value}</ThemedText>
  </Card>;
}

/** Insights › Recovery: last night's sleep stages and heart readings, straight from Apple Health. Nothing here is
 * saved, synced or sent, and nothing is estimated: a reading that is not there is left out. */
export function Recovery({ access, recovery, now }: { access: HealthAccess; recovery: RecoveryData | null; now: Date }) {
  const { colors } = useTheme();
  if (access === 'unavailable') return <Message testID="recovery-later" title={t('recoveryLaterTitle')} body={t('recoveryLaterBody')} />;
  if (access === 'ask') return <Message testID="recovery-connect" title={t('recoveryConnectTitle')} body={t('recoveryConnectBody')} />;
  if (!recovery) return <Message testID="recovery-failed" title={t('recoveryFailedTitle')} body={t('recoveryFailedBody')} />;
  const { night, restingHeartRate, hrv, heartToday, vo2Max } = recovery;
  const nothing = !night && !latest(restingHeartRate) && !latest(hrv) && !heartToday && !vo2Max;
  if (nothing) return <Message testID="recovery-empty" title={t('recoveryEmptyTitle')} body={t('recoveryEmptyBody')} />;
  return <View style={{ gap: tokens.spacing[3] }}>
    {night && <NightCard night={night} />}
    {restingHeartRate && <DailyCard testID="recovery-resting" title={t('recoveryResting')} unit="bpm" values={restingHeartRate} color={colors.sleep} now={now} />}
    {hrv && <DailyCard testID="recovery-hrv" title={t('recoveryHrv')} unit="ms" values={hrv} color={colors.sleep} now={now} />}
    {heartToday && <Line testID="recovery-heart" title={t('recoveryHeart')} value={t('recoveryHeartValue').replace('{average}', String(heartToday.average)).replace('{min}', String(heartToday.min)).replace('{max}', String(heartToday.max))} />}
    {vo2Max && <Line testID="recovery-vo2" title={t('recoveryVo2')} value={t('recoveryVo2Value').replace('{value}', vo2Max.value.toFixed(1)).replace('{date}', short(vo2Max.at))} />}
    <ThemedText muted variant="caption">{t('recoveryFootnote')}</ThemedText>
  </View>;
}
