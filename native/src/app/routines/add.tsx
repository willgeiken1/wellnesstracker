import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { NoRoutines, sheetOptions } from '@/features/routines/route-parts';
import { AddItem } from '@/features/routines/sheets';
import { routinesStoreFor } from '@/features/routines/store';

/** Add item: a large sheet from the + button, a tab's Add row or a routine's settings. */
export default function AddItemRoute() {
  const { repository } = useAuth(), { type, routine } = useLocalSearchParams<{ type?: string; routine?: string }>();
  return <>
    <Stack.Screen options={sheetOptions} />
    {repository ? <AddItem key={repository.owner} store={routinesStoreFor(repository)} type={type} routine={routine} /> : <NoRoutines />}
  </>;
}
