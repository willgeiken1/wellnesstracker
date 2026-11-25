import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { BarcodeSheet } from '@/features/food/barcode-sheet';
import { NoFood, SheetSurface, sheetOptions } from '@/features/food/sheet';

/** Scan barcode: a large sheet. */
export default function FoodSheetRoute() {
  const { repository } = useAuth();
  const params = useLocalSearchParams<{ meal?: string }>();
  return <SheetSurface>
    <Stack.Screen options={sheetOptions('large')} />
    {repository ? <BarcodeSheet key={repository.owner} repo={repository} meal={params.meal} /> : <NoFood />}
  </SheetSurface>;
}
