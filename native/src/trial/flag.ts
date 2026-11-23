import Constants from 'expo-constants';

/** True when this build was started with INSIGHT_TRIAL_STUB=1. */
export function trialStubOn(): boolean {
  const extra = Constants.expoConfig?.extra as { insightTrialStub?: boolean } | undefined;
  return extra?.insightTrialStub === true || process.env.EXPO_PUBLIC_INSIGHT_TRIAL_STUB === '1';
}
