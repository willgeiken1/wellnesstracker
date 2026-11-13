import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { ThemedText } from '../../components/themed-text';
import { touchTarget } from '../../components/button';
import { useAuth } from '../../auth/provider';
import { useTheme } from '../../design/theme-provider';
import { tokens } from '../../design/tokens';
import { useAppleHealth } from '../health/use-apple-health';
import { appleHealth } from '../health/apple';
import type { HealthSource } from '../health/source';
import { t } from '../../i18n/en';
import { Group, Heading, Notice, PrimaryButton, Shell, StrandShape, semibold } from './parts';

/** Whether setup should offer Apple Health: only where it can work and Insight has not asked before
 * (after a reinstall iOS remembers the answer, and asking again would show nothing). */
export async function shouldOfferHealth(source: HealthSource | null = appleHealth()): Promise<boolean> {
  if (!source) return false;
  try { return await source.access() === 'ask'; } catch { return false; }
}

const READS = [['healthStepWeight', 'healthStepWeightBody'], ['healthStepSteps', 'healthStepStepsBody'], ['healthStepSleep', 'healthStepSleepBody']] as const;

/** The step after Start (REDESIGN §3.6): connect Apple Health or skip it. Connecting shows Apple's own sheet,
 * puts the Steps and Sleep tiles on Home, and then goes Home. Skipping goes Home with nothing asked. */
export function HealthStep({ onDone, source }: { onDone: () => void; source?: HealthSource | null }) {
  const auth = useAuth();
  const { colors } = useTheme();
  const apple = useAppleHealth(auth.repository, source);
  // This step only opens when Insight had not asked yet, so "asked" means the person just answered Apple's sheet.
  const answered = apple.access === 'asked' && !apple.busy;
  useEffect(() => { if (answered) onDone(); }, [answered, onDone]);
  return <Shell>
    <Heading title={t('healthStepTitle')} body={t('healthStepBody')} />
    <Group testID="onboarding-health-reads" title={t('healthStepReads')}>
      {READS.map(([title, body]) => <View key={title} style={{ flexDirection: 'row', gap: tokens.spacing[2] }} accessible accessibilityLabel={`${t(title)}. ${t(body)}`}>
        <View style={{ paddingTop: 6 }}><StrandShape kind="sleep" /></View>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText style={semibold}>{t(title)}</ThemedText>
          <ThemedText muted variant="caption" style={{ lineHeight: 18 }}>{t(body)}</ThemedText>
        </View>
      </View>)}
      <ThemedText muted variant="caption" style={{ lineHeight: 18 }}>{t('healthStepPrivacy')}</ThemedText>
    </Group>
    {apple.failed && <Notice testID="onboarding-health-failed" text={t('appleHealthFailed')} onRetry={apple.connect} />}
    <View style={{ gap: tokens.spacing[1] }}>
      <PrimaryButton testID="onboarding-health-connect" label={t(apple.busy ? 'appleHealthBusy' : 'appleHealthConnect')} busy={apple.busy}
        disabled={apple.busy || apple.access === 'unavailable'} onPress={apple.connect} />
      <Pressable testID="onboarding-health-skip" accessibilityRole="button" accessibilityLabel={t('healthStepSkip')} accessibilityHint={t('healthStepLater')}
        disabled={apple.busy} onPress={onDone}
        style={({ pressed }) => ({ minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', opacity: apple.busy ? 0.5 : pressed ? 0.7 : 1 })}>
        <ThemedText style={[semibold, { color: colors.accent }]}>{t('healthStepSkip')}</ThemedText>
      </Pressable>
      <ThemedText muted variant="caption" style={{ textAlign: 'center' }}>{t('healthStepLater')}</ThemedText>
    </View>
  </Shell>;
}
