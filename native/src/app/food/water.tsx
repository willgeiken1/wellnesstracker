import { Stack } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { WaterSheet } from '@/features/food/water-sheet';
import { NoFood, SheetSurface, sheetOptions } from '@/features/food/sheet';

/** Water: a large sheet. */
export default function FoodSheetRoute() {
  const { repository } = useAuth();
  return <SheetSurface>
    <Stack.Screen options={sheetOptions('large')} />
    {repository ? <WaterSheet key={repository.owner} repo={repository} /> : <NoFood />}
  </SheetSurface>;
}
