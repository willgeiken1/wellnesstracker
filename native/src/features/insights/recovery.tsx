import { View } from 'react-native';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import type { OuraRecovery } from '@/features/health/oura';
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
function NightCard({ night, fromOura }: { night: Night; fromOura?: boolean }) {
  const { colors } = useTheme();
  // Oura calls the middle stage light sleep; Apple Health calls it core.
  const parts = ([['deep', t('recoveryDeep'), colors.sleep, 1], ['core', fromOura ? t('recoveryLight') : t('recoveryCore'), colors.sleep, 0.6], ['rem', t('recoveryRem'), colors.sleep, 0.35],
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

function DailyCard({ testID, title, unit, values, color, now }: { testID: string; title: string; unit?: string; values: (number | null)[]; color: string; now: Date }) {
  const last = latest(values), average = mean(values);
  const withUnit = (n: number | null) => unit ? `${n} ${unit}` : String(n);
  const summary = last === null ? t('recoveryNone') : `${t('recoveryLatest')} ${withUnit(last)} · ${t('recoveryWeekAverage')} ${withUnit(average)}`;
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

const has = (values: (number | null)[] | null | undefined): values is (number | null)[] => !!values && latest(values) !== null;
/** The day of the newest reading, counted from the start of the week, or -1 with none. */
const newest = (values: (number | null)[] | null | undefined) => values ? values.reduce<number>((at, v, i) => v !== null ? i : at, -1) : -1;
/** One source's whole week, never a mix: Apple Health and Oura measure heart readings differently (heart rate
 * variability is SDNN on Apple Health and RMSSD on Oura), so days from both would not compare. Apple Health is
 * used unless Oura has a more recent reading; one old Apple Health reading no longer hides a week of Oura. */
function pick(apple: (number | null)[] | null | undefined, oura: (number | null)[] | null | undefined) {
  if (has(apple) && !(has(oura) && newest(oura) > newest(apple))) return apple;
  return has(oura) ? oura : apple ?? null;
}

/** Progress › Insights › Recovery: last night's sleep stages and heart readings, straight from Apple Health, with Oura's readiness
 * and sleep scores when Oura is connected. Last night comes from Apple Health when it has one; each heart reading
 * comes from whichever of the two has the more recent day, Apple Health on a tie. Nothing is estimated: a reading that is not there is left out. */
export function Recovery({ access, recovery, oura, now }: { access: HealthAccess; recovery: RecoveryData | null; oura?: OuraRecovery | null; now: Date }) {
  const { colors } = useTheme();
  const ring = oura && (has(oura.readiness) || has(oura.sleepScore) || has(oura.hrv) || has(oura.restingHeartRate) || oura.night) ? oura : null;
  if (!ring) {
    if (access === 'unavailable') return <Message testID="recovery-later" title={t('recoveryLaterTitle')} body={t('recoveryLaterBody')} />;
    if (access === 'ask') return <Message testID="recovery-connect" title={t('recoveryConnectTitle')} body={t('recoveryConnectBody')} />;
    if (!recovery) return <Message testID="recovery-failed" title={t('recoveryFailedTitle')} body={t('recoveryFailedBody')} />;
  }
  const apple = recovery;
  const night = apple?.night ?? ring?.night ?? null, nightFromOura = !apple?.night && !!ring?.night;
  const restingHeartRate = pick(apple?.restingHeartRate, ring?.restingHeartRate), hrv = pick(apple?.hrv, ring?.hrv);
  const heartToday = apple?.heartToday ?? null, vo2Max = apple?.vo2Max ?? null;
  const nothing = !ring && !night && !latest(restingHeartRate) && !latest(hrv) && !heartToday && !vo2Max;
  if (nothing) return <Message testID="recovery-empty" title={t('recoveryEmptyTitle')} body={t('recoveryEmptyBody')} />;
  return <View style={{ gap: tokens.spacing[3] }}>
    {ring && has(ring.readiness) && <DailyCard testID="recovery-readiness" title={t('recoveryReadiness')} values={ring.readiness} color={colors.sleep} now={now} />}
    {ring && has(ring.sleepScore) && <DailyCard testID="recovery-sleep-score" title={t('recoverySleepScore')} values={ring.sleepScore} color={colors.sleep} now={now} />}
    {night && <NightCard night={night} fromOura={nightFromOura} />}
    {restingHeartRate && <DailyCard testID="recovery-resting" title={t('recoveryResting')} unit="bpm" values={restingHeartRate} color={colors.sleep} now={now} />}
    {hrv && <DailyCard testID="recovery-hrv" title={t('recoveryHrv')} unit="ms" values={hrv} color={colors.sleep} now={now} />}
    {heartToday && <Line testID="recovery-heart" title={t('recoveryHeart')} value={t('recoveryHeartValue').replace('{average}', String(heartToday.average)).replace('{min}', String(heartToday.min)).replace('{max}', String(heartToday.max))} />}
    {vo2Max && <Line testID="recovery-vo2" title={t('recoveryVo2')} value={t('recoveryVo2Value').replace('{value}', vo2Max.value.toFixed(1)).replace('{date}', short(vo2Max.at))} />}
    <ThemedText muted variant="caption">{ring ? t('recoveryFootnoteOura') : t('recoveryFootnote')}</ThemedText>
  </View>;
}
