import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { ForceDark } from '@/design/theme-provider';
import { BarcodeSheet } from '@/features/food/barcode-sheet';
import { NoFood, SheetSurface, sheetOptions } from '@/features/food/sheet';

/** Scan barcode: a large sheet, dark in both appearances as a camera is. */
export default function FoodSheetRoute() {
  const { repository } = useAuth();
  const params = useLocalSearchParams<{ meal?: string }>();
  return <ForceDark><SheetSurface>
    <Stack.Screen options={sheetOptions('large')} />
    {repository ? <BarcodeSheet key={repository.owner} repo={repository} meal={params.meal} /> : <NoFood />}
  </SheetSurface></ForceDark>;
}
