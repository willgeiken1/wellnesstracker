import { View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { lastDays } from '@/features/health/days';
import type { HealthSource } from '@/features/health/source';
import { useHealthDays } from '@/features/health/use-health-days';
import { useFocused } from '@/features/home/use-focused';
import { t } from '@/i18n/en';
import { MiniChart } from './mini-chart';

const NIGHTS = 30;
const semibold = { fontWeight: '600' } as const;
const short = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
/** "7 h 42 min" (or "7 h" on the hour) from hours. */
export function hoursLabel(hours: number) {
  const total = Math.round(hours * 60);
  return t(total % 60 ? 'recoveryHoursMinutes' : 'recoveryHours').replace('{h}', String(Math.floor(total / 60))).replace('{m}', String(total % 60));
}
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
/** A night with no sleep recorded is unknown, not zero hours. */
const nights = (hours: number[]) => hours.map(h => h > 0 ? h : null);
/** A week's average needs at least this many recorded days, or it would pass one night off as a week. */
export const WEEK_MIN = 3;
/** The average of the recorded days in the last 7, or null when fewer than WEEK_MIN were recorded. */
export function weekAverage(values: (number | null)[]) {
  const known = values.slice(-7).filter((v): v is number => v !== null && v > 0);
  return known.length >= WEEK_MIN ? mean(known) : null;
}

/** Plain facts about last night against the nights before it (Q20: no praise or judgement words). */
export function lastNightLine(sleep: (number | null)[]) {
  const last = sleep.at(-1), before = sleep.slice(-8, -1).filter((h): h is number => h !== null), average = mean(before);
  if (last == null || average === null) return null;
  const minutes = Math.round((last - average) * 60);
  if (minutes === 0) return t('recoveryAtAverage');
  const diff = Math.abs(minutes) >= 60 ? hoursLabel(Math.abs(minutes) / 60) : `${Math.abs(minutes)} min`;
  return t('recoveryVsAverage').replace('{diff}', diff).replace('{direction}', t(minutes > 0 ? 'recoveryAbove' : 'recoveryBelow'));
}

function Tile({ label, value, testID }: { label: string; value: string; testID: string }) {
  return <Card testID={testID} accessible accessibilityLabel={`${label}: ${value}`} style={{ flexGrow: 1, flexBasis: 140, gap: 4 }}>
    <ThemedText muted variant="caption" style={semibold}>{label}</ThemedText>
    <ThemedText numeric variant="headline" style={semibold}>{value}</ThemedText>
  </Card>;
}

/**
 * Insights › Recovery: last night's sleep, the week's sleep and steps, and 30 nights of sleep, from Apple Health
 * (REDESIGN §3.4). Read on the phone and held in memory for this screen only; nothing is saved, synced or sent.
 * Heart data is not read, so there is no HRV tile.
 */
export function Recovery({ now, source }: { now: Date; source?: HealthSource | null }) {
  const { colors } = useTheme(), { phoneOnly } = useAuth();
  const health = useHealthDays(useFocused(), source, NIGHTS);
  if (!health) {
    return <Card testID="recovery-connect" style={{ gap: tokens.spacing[1] }}>
      <ThemedText variant="headline" accessibilityRole="header" style={semibold}>{t('recoveryConnectTitle')}</ThemedText>
      <ThemedText muted>{t(phoneOnly ? 'recoveryPhoneOnlyBody' : 'recoveryConnectBody')}</ThemedText>
      {!phoneOnly && <Button variant="secondary" label={t('recoveryConnectAction')} onPress={() => router.push('/settings/health')} />}
    </Card>;
  }
  const sleep = health.sleepHours ? nights(health.sleepHours) : null, steps = health.steps;
  const days = lastDays(now, NIGHTS), last = sleep?.at(-1) ?? null;
  const week = sleep ? weekAverage(sleep) : null;
  // A day with no steps recorded is unknown too, so it shows a dash rather than 0.
  const stepsToday = steps?.at(-1) ?? 0, stepsWeek = steps ? weekAverage(steps) : null;
  const recorded = sleep ? sleep.filter(h => h !== null).length : 0;
  const compare = sleep ? lastNightLine(sleep) : null;
  return <View style={{ gap: tokens.spacing[3] }}>
    <Card testID="recovery-last-night" accessible accessibilityLabel={last === null ? `${t('recoveryLastNight')}: ${t('recoveryNoData')}` : `${t('recoveryLastNight')}: ${hoursLabel(last)}. ${compare ?? ''}`} style={{ gap: 4 }}>
      <ThemedText muted variant="caption" style={semibold}>{t('recoveryLastNight')}</ThemedText>
      {last === null
        ? <ThemedText muted>{t('recoveryNoData')}</ThemedText>
        : <>
          <ThemedText numeric variant="title" style={semibold}>{hoursLabel(last)}</ThemedText>
          {compare && <ThemedText muted>{compare}</ThemedText>}
        </>}
    </Card>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[2] }}>
      <Tile testID="recovery-sleep-week" label={t('recoverySleepAverage')} value={week === null ? '—' : hoursLabel(week)} />
      <Tile testID="recovery-steps-today" label={t('recoveryStepsToday')} value={stepsToday > 0 ? Math.round(stepsToday).toLocaleString('en-US') : '—'} />
      <Tile testID="recovery-steps-week" label={t('recoveryStepsAverage')} value={stepsWeek === null ? '—' : Math.round(stepsWeek).toLocaleString('en-US')} />
    </View>
    {sleep && recorded > 0 && <Card testID="recovery-sleep-month" accessible accessibilityRole="image"
      accessibilityLabel={`${t('recoverySleepMonth')}. ${t('recoveryNights').replace('{count}', String(recorded))}. ${t('recoveryGoalLine')}`} style={{ gap: tokens.spacing[1] }}>
      <ThemedText variant="headline" style={semibold}>{t('recoverySleepMonth')}</ThemedText>
      <ThemedText muted numeric variant="caption">{`${t('recoveryNights').replace('{count}', String(recorded))} · ${t('recoveryGoalLine')}`}</ThemedText>
      <MiniChart values={sleep} goal={7} color={colors.sleep} first={short(days[0])} last={short(days.at(-1)!)} />
    </Card>}
    <ThemedText muted variant="caption">{t('recoverySource')}</ThemedText>
  </View>;
}
