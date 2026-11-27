import { Stack } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { ItemSheet } from '@/features/food/item-sheet';
import { NoFood, SheetSurface, sheetOptions } from '@/features/food/sheet';

/** Food details: a large sheet, on the food handed over by the sheet or tile that opened it. */
export default function FoodSheetRoute() {
  const { repository } = useAuth();
  return <SheetSurface>
    <Stack.Screen options={sheetOptions('large')} />
    {repository ? <ItemSheet key={repository.owner} repo={repository} /> : <NoFood />}
  </SheetSurface>;
}
