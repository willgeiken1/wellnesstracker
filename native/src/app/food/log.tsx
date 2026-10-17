import { router } from 'expo-router';
import { Screen } from '@/components/screen';
import { EmptyState } from '@/components/empty-state';
import { t } from '@/i18n/en';
export default function FoodLog() {
  return <Screen><EmptyState title={t('foodLog')} action={{ label: t('backHome'), onPress: () => router.navigate('/') }} /></Screen>;
}
