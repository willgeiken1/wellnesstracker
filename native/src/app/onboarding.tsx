import { Stack } from 'expo-router';
import { useTheme } from '../design/theme-provider';
import { Onboarding } from '../features/onboarding/screen';

/** Setup screens fade in over 0.32 s and never slide; under Reduce Motion they simply appear. */
export default function OnboardingRoute() {
  const { reduceMotion } = useTheme();
  return <>
    <Stack.Screen options={{ headerShown: false, gestureEnabled: false, animation: reduceMotion ? 'none' : 'fade', animationDuration: 320 }} />
    <Onboarding />
  </>;
}
