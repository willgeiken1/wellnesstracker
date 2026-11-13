import { Stack } from 'expo-router';
import { ScoreDetail } from '@/features/score/detail';
import { t } from '@/i18n/en';

export default function ScorePage() {
  // The page shows its own title, so the bar carries only Back; `title` still names it for VoiceOver.
  return <><Stack.Screen options={{ title: t('scoreTitle'), headerTitle: '', headerBackButtonDisplayMode: 'minimal' }} /><ScoreDetail /></>;
}
