import { Stack } from 'expo-router';
import { LogWeightSheet } from '@/features/progress/screens/log-weight';
import { mediumSheet } from '@/features/navigation/presentation';

/** The Log weight sheet, at medium height. */
export default function LogWeightRoute() {
  return <>
    <Stack.Screen options={mediumSheet('log-weight')} />
    <LogWeightSheet />
  </>;
}
