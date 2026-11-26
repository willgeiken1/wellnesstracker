import { Stack } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { ContainersSheet } from '@/features/food/containers-sheet';
import { NoFood, SheetSurface, sheetOptions } from '@/features/food/sheet';

/** Water containers: a large sheet. */
export default function FoodSheetRoute() {
  const { repository } = useAuth();
  return <SheetSurface>
    <Stack.Screen options={sheetOptions('large')} />
    {repository ? <ContainersSheet key={repository.owner} repo={repository} /> : <NoFood />}
  </SheetSurface>;
}
