import { useLocalSearchParams } from 'expo-router';
import { AddItemSheet } from '@/features/routines-ui/add-item';

const one = (value: string | string[] | undefined) => (typeof value === 'string' && value ? value : undefined);

/** Add item. With `itemId` it edits that item; `blockId` or `type` says where a new one was added from; `step=converter` opens on the converter. */
export default function AddItemRoute() {
  const params = useLocalSearchParams<{ itemId?: string; type?: string; blockId?: string; step?: string }>();
  return <AddItemSheet itemId={one(params.itemId)} type={one(params.type)} blockId={one(params.blockId)} converter={one(params.step) === 'converter'} />;
}
