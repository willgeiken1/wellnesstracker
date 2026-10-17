import { router } from 'expo-router';
import { Screen } from '@/components/screen';
import { EmptyState } from '@/components/empty-state';
import { t } from '@/i18n/en';
export default function Food() {
  return <Screen title={t('food')} tabHeader><EmptyState title={t('food')}
    action={{ label: t('logFood'), onPress: () => router.push('/food/log') }} /></Screen>;
}
