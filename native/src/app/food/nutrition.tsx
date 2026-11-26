import { Stack } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { NutritionScreen } from '@/features/food/nutrition-screen';
import { NoFood, pushedOptions } from '@/features/food/sheet';

/** Nutrition, pushed from the Food tab and its tiles. */
export default function FoodNutritionRoute() {
  const { repository } = useAuth();
  return <>
    <Stack.Screen options={pushedOptions} />
    {repository ? <NutritionScreen key={repository.owner} repo={repository} /> : <NoFood />}
  </>;
}
