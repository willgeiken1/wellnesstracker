import { router } from 'expo-router';
import { EmptyState } from '@/components/empty-state';
import { useAuth } from '@/auth/provider';
import { Screen } from '@/components/screen';
import { t } from '@/i18n/en';

export default function Food() {
  const { repository } = useAuth();
  if (!repository) return <Screen title={t('food')} tabHeader><EmptyState title={t('food')} action={{ label: t('logFood'), onPress: () => router.push('/food/log') }} /></Screen>;
  // The tab and its tiles draw with Skia, so they load once there is an account or demo to show rather than with the
  // route table (which also keeps Skia out of tests that only walk the routes).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FoodTab } = require('@/features/food/tab') as typeof import('@/features/food/tab');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@/features/food/tiles');
  return <FoodTab key={repository.owner} repo={repository} />;
}
