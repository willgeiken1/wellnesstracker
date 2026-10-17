import { router } from 'expo-router';
import { Screen } from '@/components/screen';
import { EmptyState } from '@/components/empty-state';
import { t } from '@/i18n/en';
export default function Workout() {
  return <Screen><EmptyState title={t('workout')} action={{ label: t('closeWorkout'),
    onPress: () => router.canDismiss() ? router.dismiss() : router.replace('/') }} /></Screen>;
}
