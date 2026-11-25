import { Stack } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { CopySheet } from '@/features/food/copy-sheet';
import { NoFood, SheetSurface, sheetOptions } from '@/features/food/sheet';

/** Copy yesterday: a medium sheet. */
export default function FoodSheetRoute() {
  const { repository } = useAuth();
  return <SheetSurface>
    <Stack.Screen options={sheetOptions('medium')} />
    {repository ? <CopySheet key={repository.owner} repo={repository} /> : <NoFood />}
  </SheetSurface>;
}
