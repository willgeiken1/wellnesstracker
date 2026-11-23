import { useLocalSearchParams } from 'expo-router';
import { ItemDetails } from '@/features/routines-ui/details';

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';
export default function RoutineItemRoute() {
  const params = useLocalSearchParams<{ itemId?: string; logId?: string }>();
  return <ItemDetails itemId={one(params.itemId)} logId={one(params.logId) || undefined} />;
}
