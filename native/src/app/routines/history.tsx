import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { NoRoutines } from '@/features/routines/route-parts';
import { RoutineHistory } from '@/features/routines/screens';
import { routinesStoreFor } from '@/features/routines/store';

/** Routine history, the last 30 days. */
export default function RoutineHistoryRoute() {
  const { repository } = useAuth(), { routine } = useLocalSearchParams<{ routine?: string }>();
  return <>
    <Stack.Screen options={{ headerShown: false }} />
    {repository ? <RoutineHistory key={repository.owner} store={routinesStoreFor(repository)} initial={routine ?? 'all'} /> : <NoRoutines />}
  </>;
}
