import { Stack, useLocalSearchParams } from 'expo-router';
import { TileEditorSheet } from '@/features/tiles';
import { tileEditSheet } from '@/features/navigation/presentation';

/** The tile editor sheet for the tile grid; `page` (and `id`) come from the grid's route. */
export default function TileEditRoute() {
  const { page, id } = useLocalSearchParams<{ page?: string; id?: string }>();
  return <>
    <Stack.Screen options={tileEditSheet(page, id)} />
    <TileEditorSheet page={page} id={id} />
  </>;
}
