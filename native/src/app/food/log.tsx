import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { LogSheet } from '@/features/food/log-sheet';
import { NoFood, SheetSurface, sheetOptions } from '@/features/food/sheet';

/** Log food: a large sheet over the Food tab. */
export default function FoodSheetRoute() {
  const { repository } = useAuth();
  const params = useLocalSearchParams<{ meal?: string }>();
  return <SheetSurface>
    <Stack.Screen options={sheetOptions('large')} />
    {repository ? <LogSheet key={repository.owner} repo={repository} meal={params.meal} /> : <NoFood />}
  </SheetSurface>;
}
