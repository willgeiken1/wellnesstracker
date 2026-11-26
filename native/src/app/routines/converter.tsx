import { Stack, useLocalSearchParams } from 'expo-router';
import { sheetOptions } from '@/features/routines/route-parts';
import { Converter } from '@/features/routines/sheets';

/** Unit converter: a large sheet. Opened from Add item it can save its result as a note on the item. */
export default function ConverterRoute() {
  const { from, amt, unit } = useLocalSearchParams<{ from?: string; amt?: string; unit?: string }>();
  return <>
    <Stack.Screen options={sheetOptions} />
    <Converter from={from} amt={amt} unit={unit} />
  </>;
}
