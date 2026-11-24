import { useLocalSearchParams } from 'expo-router';
import { AddItemSheet } from '@/features/routines-ui/add-item';

const one = (value: string | string[] | undefined) => (typeof value === 'string' && value ? value : undefined);

/** Add item. With `itemId` it edits that item; `type` is the type tab a new one was added from; `step=converter` opens on the converter. */
export default function AddItemRoute() {
  const params = useLocalSearchParams<{ itemId?: string; type?: string; step?: string }>();
  return <AddItemSheet itemId={one(params.itemId)} type={one(params.type)} converter={one(params.step) === 'converter'} />;
}
