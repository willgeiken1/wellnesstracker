import { Stack, useLocalSearchParams } from 'expo-router';
import { PageSectionSheet, tileSheetOptions } from '@/features/tiles';

/** Form sheet for the tile grid; `page` (and `id`) come from the grid's route. */
export default function TileSectionRoute() {
  const { page, id } = useLocalSearchParams<{ page?: string; id?: string }>();
  return <>
    <Stack.Screen options={tileSheetOptions.section} />
    <PageSectionSheet page={page} id={id} />
  </>;
}
