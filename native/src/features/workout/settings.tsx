import { PlateSettings } from './plate-settings';
import { Screen } from '@/components/screen';
import { Group, InfoRow, ChoiceChips, SectionLabel, ToggleRow, QuietCard } from '@/features/settings/parts';
import { t } from '@/i18n/en';
import { compareRows } from '@/data/rows';
import { useWorkout } from './use-workout';
import { REST_OPENS, restOpens, setRestOpens } from './rest-pref';
import { REST_STYLES, restChoices } from './rest-options';
import { summaryLength, setSummaryLength } from './ai/service';
const LENGTHS = [{ value: 'short', label: t('workoutAiShort') }, { value: 'coach', label: t('workoutAiCoach') }, { value: 'detailed', label: t('workoutAiDetailed') }] as const;
export function WorkoutSettings() {
  // Reads saved choices straight from the repository on every render, so a tap shows as chosen at once.
  'use no memo';
  const {
    store
  } = useWorkout();
  if (!store) return <Screen title={t('workoutSettings')}><QuietCard title={t('localError')} /></Screen>;
  const settings = store.repo.list('settings').sort(compareRows).at(-1);
  return <Screen title={t('workoutSettings')}>
    <SectionLabel>{t('settingsRestTimer')}</SectionLabel>
    <Group testID="workout-settings-rest">
      <InfoRow label={t('defaultRest')}>
        <ChoiceChips options={restChoices([60, 90, 120, 180])} value={Number(settings?.data.rest_seconds ?? 90)} onChange={seconds => store.repo.save('settings', {
          ...settings?.data,
          rest_seconds: seconds
        }, settings?.id)} />
      </InfoRow>
      <InfoRow label={t('restOpens')} hint={t('restOpensBody')}>
        <ChoiceChips options={REST_OPENS.map(value => ({ value, label: t(value === 'bar' ? 'restOpensBar' : 'restOpensFull') }))}
          value={restOpens(store.repo)} onChange={value => setRestOpens(store.repo, value)} />
      </InfoRow>
      <InfoRow label={t('restStyle')}>
        <ChoiceChips options={REST_STYLES.map(style => ({ value: style, label: t(style) }))}
          value={store.defaultRestStyle()} onChange={style => store.setDefaultRestStyle(style)} />
      </InfoRow>
    </Group>
    <SectionLabel>{t('gymPlates')}</SectionLabel>
    <PlateSettings store={store} />
    <SectionLabel>{t('settingsSummary')}</SectionLabel>
    <Group testID="workout-settings-summary">
      <InfoRow label={t('workoutAiLength')}>
        <ChoiceChips stacked options={LENGTHS} value={summaryLength(store.repo)} onChange={length => setSummaryLength(store.repo, length)} />
      </InfoRow>
    </Group>
    <SectionLabel>{t('settingsFeedback')}</SectionLabel>
    <Group testID="workout-settings-feedback">
      <ToggleRow testID="workout-haptics" label={t('settingsHaptics')} hint={t('settingsHapticsHint')} value={store.hapticsEnabled()} onValueChange={() => store.toggleHaptics()} />
    </Group>
  </Screen>;
}
