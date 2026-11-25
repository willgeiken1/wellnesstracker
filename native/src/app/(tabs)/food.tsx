import { EmptyState } from '@/components/empty-state';
import { useAuth } from '@/auth/provider';
import { Screen } from '@/components/screen';
import { t } from '@/i18n/en';
import { FoodTab } from '@/features/food/tab';
import '@/features/food/tiles';

export default function Food() {
  const { repository } = useAuth();
  return repository ? <FoodTab key={repository.owner} repo={repository} /> : <Screen title={t('food')} tabHeader><EmptyState title={t('food')} /></Screen>;
}
