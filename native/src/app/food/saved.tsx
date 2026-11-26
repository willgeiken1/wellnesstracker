import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { SavedSheet } from '@/features/food/saved-sheet';
import { NoFood, SheetSurface, sheetOptions } from '@/features/food/sheet';

/** Saved meals: a large sheet. */
export default function FoodSheetRoute() {
  const { repository } = useAuth();
  const params = useLocalSearchParams<{ meal?: string; open?: string }>();
  return <SheetSurface>
    <Stack.Screen options={sheetOptions('large')} />
    {repository ? <SavedSheet key={repository.owner} repo={repository} meal={params.meal} open={params.open} /> : <NoFood />}
  </SheetSurface>;
}
