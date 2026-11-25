import { Stack, useLocalSearchParams } from 'expo-router';
import { TileCustomizeSheet, tileSheetOptions } from '@/features/tiles';

/** Form sheet for the tile grid; `page` (and `id`) come from the grid's route. */
export default function TileEditRoute() {
  const { page, id } = useLocalSearchParams<{ page?: string; id?: string }>();
  return <>
    <Stack.Screen options={tileSheetOptions.edit} />
    <TileCustomizeSheet page={page} id={id} />
  </>;
}
