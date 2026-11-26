import { useContext, useState } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import { AuthContext } from '@/auth/provider';
import { Screen } from '@/components/screen';
import { scoreOn, setScoreOn } from '@/features/home/tiles';
import { Profile } from '@/features/onboarding/profile';
import { Group, NavRow, QuietCard, ToggleRow } from '@/features/settings/parts';
import { LicenseNotice, Licenses, noticeTitle } from '@/features/settings/licenses/screen';
import { AboutPage, AccountPage, ConnectionsPage, DataPage, DiagnosticsList, GoalsPage, PrivacyPage, RemindersPage, UnitsPage, WorkoutPage } from '@/features/settings/pages';
import { DeleteAccountPage, DeleteRangePage, FeedbackPage, PrivacyCenterPage, WhatsNewPage } from '@/features/settings/more-pages';
import { SetPage } from '@/features/settings/ui';
import { useDataActions } from '@/features/settings/data-actions';
import { t } from '@/i18n/en';
import { AI_FEATURES_ENABLED } from '@/features/ai-launch';
import { FoodAiPrivacy } from '@/features/food/ai/privacy';

/** Insight Score: one switch for the card on Home and the header ring, and the way to how it is worked out. */
function ScoreSettings() {
  // Settings also opens with no account provider around it; the switch is then not offered.
  const repository = useContext(AuthContext)?.repository ?? null;
  const [on, setOn] = useState(() => scoreOn(repository));
  if (!repository) return <QuietCard title={t('notInVersion')} />;
  return <Group testID="settings-score">
    <ToggleRow testID="settings-score-switch" label={t('scoreSettingShow')} hint={t('scoreSettingHint')} value={on} onValueChange={next => {
      // The switch only moves once the layout is saved, so it never shows something Home will not.
      try { setScoreOn(repository, next); setOn(next); } catch { /* left as it was */ }
    }} />
    <NavRow label={t('scoreHow')} onPress={() => router.push('/score')} />
  </Group>;
}

function Data() {
  const actions = useDataActions();
  return <DataPage backup={actions.backup} restore={actions.restore} />;
}

/** What is sent for meal estimates and workout summaries, and the consent for it. */
function AiPrivacy() {
  const repository = useContext(AuthContext)?.repository;
  return repository ? <FoodAiPrivacy repo={repository} /> : null;
}

/** One Settings page, by its id. Every page draws its own bar with the back button and title. */
export default function SettingsSection() {
  const { section, notice } = useLocalSearchParams<{ section: string; notice?: string; focus?: string }>();
  // The phone-only build has no Apple Health, Oura or notifications: those pages keep their layout and offer nothing they cannot do.
  const limited = Constants.expoConfig?.extra?.phoneOnly === true;
  switch (section) {
    case 'goals': return <GoalsPage />;
    case 'connections': case 'health': return <ConnectionsPage limited={limited} />;
    case 'account': return <AccountPage />;
    case 'reminders': case 'notifications': return <RemindersPage limited={limited} />;
    // AI meal estimates are off for launch; their privacy controls only show once they are on.
    case 'privacy': return <PrivacyPage crash={<DiagnosticsList />} ai={AI_FEATURES_ENABLED ? <AiPrivacy /> : null} />;
    case 'units': return <UnitsPage />;
    case 'workout': return <WorkoutPage />;
    case 'data': return <Data />;
    case 'about': return <AboutPage />;
    case 'privacy-center': return <PrivacyCenterPage />;
    case 'delete-account': return <DeleteAccountPage />;
    case 'delete-range': return <DeleteRangePage />;
    case 'whats-new': return <WhatsNewPage />;
    case 'feedback': return <FeedbackPage />;
    case 'licenses': {
      const title = notice ? noticeTitle(notice) : t('licenses');
      return <SetPage back={notice ? t('licenses') : t('settingsAboutTitle')} title={title}>
        <Stack.Screen options={{ title }} />
        <Screen>{notice ? <LicenseNotice notice={notice} /> : <Licenses />}</Screen>
      </SetPage>;
    }
    case 'profile': return <SetPage back={t('settings')} title={t('profile')}><Profile /></SetPage>;
    case 'score': return <SetPage back={t('settings')} title={t('scoreSetting')}><ScoreSettings /></SetPage>;
    default: return <SetPage back={t('settings')} title={t('settings')}><QuietCard title={t('notInVersion')} /></SetPage>;
  }
}
