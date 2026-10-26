import { PlateSettings } from './plate-settings';
import { View } from 'react-native';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { t } from '@/i18n/en';
import { compareRows } from '@/data/rows';
import { useWorkout } from './use-workout';
import { layout } from './primitives';
export function WorkoutSettings() {
  const {
    store
  } = useWorkout();
  if (!store) return <Screen><ThemedText>{t('localError')}</ThemedText></Screen>;
  const settings = store.repo.list('settings').sort(compareRows).at(-1);
  return <Screen title={t('workoutSettings')}>
    <ThemedText>{t('defaultRest')}</ThemedText><View style={[layout.row, {
      flexWrap: 'wrap'
    }]}>{[60, 90, 120, 180].map(seconds => <Button key={seconds} label={`${seconds} ${t('seconds')}`} selected={Number(settings?.data.rest_seconds ?? 90) === seconds} variant="secondary" onPress={() => store.repo.save('settings', {
        ...settings?.data,
        rest_seconds: seconds
      }, settings?.id)} />)}</View>
    <PlateSettings store={store} />
    <ThemedText>{t('restStyle')}</ThemedText><View style={layout.row}>{(['unwind', 'converge'] as const).map(style => <Button key={style} label={t(style)} variant="secondary" selected={(store.repo.localGet('restStyle') ?? 'unwind') === style} onPress={() => store.repo.localSave('restStyle', style)} />)}</View>
    <Button label={store.repo.localGet('haptics') === false ? t('enableHaptics') : t('disableHaptics')} variant="secondary" onPress={() => store.repo.localSave('haptics', store.repo.localGet('haptics') === false)} />
  </Screen>;
}
