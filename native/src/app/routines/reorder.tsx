import { Stack } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { NoRoutines } from '@/features/routines/route-parts';
import { RoutinesReorder } from '@/features/routines/screens';
import { routinesStoreFor } from '@/features/routines/store';

/** Edit routines: reorder, add and restore. */
export default function RoutinesReorderRoute() {
  const { repository } = useAuth();
  return <>
    <Stack.Screen options={{ headerShown: false }} />
    {repository ? <RoutinesReorder key={repository.owner} store={routinesStoreFor(repository)} /> : <NoRoutines />}
  </>;
}
