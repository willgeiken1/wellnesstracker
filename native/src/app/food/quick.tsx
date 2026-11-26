import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { QuickSheet } from '@/features/food/quick-sheet';
import { NoFood, SheetSurface, sheetOptions } from '@/features/food/sheet';

/** Quick add: a medium sheet. */
export default function FoodSheetRoute() {
  const { repository } = useAuth();
  const params = useLocalSearchParams<{ meal?: string; name?: string; mine?: string }>();
  return <SheetSurface>
    <Stack.Screen options={sheetOptions('quick-cal')} />
    {repository ? <QuickSheet key={repository.owner} repo={repository} meal={params.meal} name={params.name} mine={params.mine === '1'} /> : <NoFood />}
  </SheetSurface>;
}
