import { router } from 'expo-router';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { routinesText } from '@/i18n/en';
import { PrimaryButton } from './parts';

/** Holds a route until its screen lands: Add item with the converter, New routine, Edit routines and the setup
 * quiz are built apart from the tab and take these routes over. */
export function RoutineComing({ title }: { title: string }) {
  return <Screen title={title} topInset>
    <ThemedText variant="headline" accessibilityRole="header">{routinesText('comingTitle')}</ThemedText>
    <ThemedText muted>{routinesText('comingBody')}</ThemedText>
    <PrimaryButton testID="routine-coming-close" label={routinesText('close')} onPress={() => router.back()} />
  </Screen>;
}
