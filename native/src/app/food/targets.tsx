import { Stack } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { FoodPage } from '@/features/food/meal-screen';
import { useFoodDay } from '@/features/food/selection';
import { NoFood, pushedOptions } from '@/features/food/sheet';
import { FoodTargets } from '@/features/food/targets';
import { useFoodRevision } from '@/features/food/use-food-revision';
import type { Repository } from '@/data/repository';
import { t } from '@/i18n/en';

function Targets({ repo }: { repo: Repository }) {
  const revision = useFoodRevision(repo), { day } = useFoodDay();
  return <FoodPage back={t('foodNutrition')} title={t('foodTargets')}><FoodTargets repo={repo} day={day} revision={revision} /></FoodPage>;
}
/** Food targets, from Nutrition: the existing targets form. */
export default function FoodTargetsRoute() {
  const { repository } = useAuth();
  return <>
    <Stack.Screen options={pushedOptions} />
    {repository ? <Targets key={repository.owner} repo={repository} /> : <NoFood />}
  </>;
}
