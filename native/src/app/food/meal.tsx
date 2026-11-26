import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { MealScreen } from '@/features/food/meal-screen';
import { NoFood, pushedOptions } from '@/features/food/sheet';

/** A meal of the picked day, pushed from the Food tab. */
export default function FoodMealRoute() {
  const { repository } = useAuth();
  const { meal } = useLocalSearchParams<{ meal?: string }>();
  return <>
    <Stack.Screen options={pushedOptions} />
    {repository ? <MealScreen key={repository.owner} repo={repository} meal={meal ?? ''} /> : <NoFood />}
  </>;
}
