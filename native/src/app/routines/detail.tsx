import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { NoRoutines } from '@/features/routines/route-parts';
import { RoutineDetail } from '@/features/routines/screens';
import { routinesStoreFor } from '@/features/routines/store';

/** Routine detail, pushed from the tab, its tiles and Edit routines. */
export default function RoutineDetailRoute() {
  const { repository } = useAuth(), { routine } = useLocalSearchParams<{ routine?: string }>();
  return <>
    <Stack.Screen options={{ headerShown: false }} />
    {repository ? <RoutineDetail key={repository.owner} store={routinesStoreFor(repository)} rid={routine ?? 'night'} /> : <NoRoutines />}
  </>;
}
