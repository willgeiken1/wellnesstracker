import { Stack, useLocalSearchParams } from 'expo-router';
import { copyDaySheet } from '@/features/navigation/presentation';
import { useAuth } from '@/auth/provider';
import { CopySheet } from '@/features/food/copy-sheet';
import { NoFood, SheetSurface } from '@/features/food/sheet';

/** Copy yesterday: a medium sheet as tall as yesterday's meals need. */
export default function FoodSheetRoute() {
  const { repository } = useAuth();
  const { meals } = useLocalSearchParams<{ meals?: string }>();
  return <SheetSurface>
    <Stack.Screen options={{ ...copyDaySheet(meals), contentStyle: { flex: 1 } }} />
    {repository ? <CopySheet key={repository.owner} repo={repository} /> : <NoFood />}
  </SheetSurface>;
}
