import { Redirect, useLocalSearchParams } from 'expo-router';
import { INSIGHT_SECTIONS } from '@/features/insights/screen';
import { oneOf } from '@/features/progress/views';
/** Insights lives inside Progress now. An old /insights link still lands there, on the section it names if it is
 * one of the four. */
export default function InsightsLink() {
  const section = oneOf(INSIGHT_SECTIONS, useLocalSearchParams<{ section?: string }>().section);
  return <Redirect href={{ pathname: '/progress', params: section ? { view: 'insights', section } : { view: 'insights' } }} />;
}
