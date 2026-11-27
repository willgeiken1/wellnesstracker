import { Stack, useLocalSearchParams } from 'expo-router';
import { TileTraySheet, tileSheetOptions } from '@/features/tiles';

/** Form sheet for the tile grid; `page` (and `id`) come from the grid's route. */
export default function TileTrayRoute() {
  const { page } = useLocalSearchParams<{ page?: string }>();
  return <>
    <Stack.Screen options={tileSheetOptions.tray} />
    <TileTraySheet page={page} />
  </>;
}
