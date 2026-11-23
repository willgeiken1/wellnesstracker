import { useLocalSearchParams } from 'expo-router';
import { RoutineSheet } from '@/features/routines-ui/new-routine';

/** Edit routine: the New routine form, opened on one routine. */
export default function EditRoutineRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <RoutineSheet blockId={typeof id === 'string' ? id : ''} />;
}
