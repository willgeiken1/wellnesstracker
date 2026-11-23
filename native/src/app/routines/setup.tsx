import { useLocalSearchParams } from 'expo-router';
import { SetupSheet } from '@/features/routines-ui/setup';

/** The setup quiz. `mode=retake` starts from the saved answers. */
export default function SetupRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return <SetupSheet mode={mode === 'retake' ? 'retake' : 'quiz'} />;
}
