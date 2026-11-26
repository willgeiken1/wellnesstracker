import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { NoRoutines, sheetOptions } from '@/features/routines/route-parts';
import { PauseRoutine } from '@/features/routines/sheets';
import { routinesStoreFor } from '@/features/routines/store';

/** Pause routine: a large sheet from the + button or a routine's settings. */
export default function PauseRoutineRoute() {
  const { repository } = useAuth(), { routine } = useLocalSearchParams<{ routine?: string }>();
  return <>
    <Stack.Screen options={sheetOptions} />
    {repository ? <PauseRoutine key={repository.owner} store={routinesStoreFor(repository)} routine={routine} /> : <NoRoutines />}
  </>;
}
