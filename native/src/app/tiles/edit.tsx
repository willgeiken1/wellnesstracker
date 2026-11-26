import { Stack, useLocalSearchParams } from 'expo-router';
import { TileCustomizeSheet } from '@/features/tiles';
import { tileEditSheet } from '@/features/navigation/presentation';

/** Form sheet for the tile grid; `page` (and `id`) come from the grid's route. */
export default function TileEditRoute() {
  const { page, id } = useLocalSearchParams<{ page?: string; id?: string }>();
  return <>
    <Stack.Screen options={tileEditSheet(page)} />
    <TileCustomizeSheet page={page} id={id} />
  </>;
}
