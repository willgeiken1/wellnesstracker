import { Stack } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { NoRoutines, sheetOptions } from '@/features/routines/route-parts';
import { NewRoutine } from '@/features/routines/sheets';
import { routinesStoreFor } from '@/features/routines/store';

/** New routine: a large sheet from the + button, the Routines tab or Edit routines. */
export default function NewRoutineRoute() {
  const { repository } = useAuth();
  return <>
    <Stack.Screen options={sheetOptions} />
    {repository ? <NewRoutine key={repository.owner} store={routinesStoreFor(repository)} /> : <NoRoutines />}
  </>;
}
