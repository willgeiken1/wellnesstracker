import { EmptyState } from '@/components/empty-state';
import { useAuth } from '@/auth/provider';
import { Screen } from '@/components/screen';
import { t } from '@/i18n/en';

/** The Routines tab. */
export default function Routines() {
  const { repository } = useAuth();
  if (!repository) return <Screen title={t('routinesTitle')} tabHeader><EmptyState icon="routines" color="sleep" title={t('routinesTitle')} description={t('routinesSignedOut')} /></Screen>;
  // The tab and its tiles draw with Skia, so they load once there is an account or demo to show rather than with the
  // route table (which also keeps Skia out of tests that only walk the routes).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { RoutinesTabPage } = require('@/features/routines/tab') as typeof import('@/features/routines/tab');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@/features/routines/tiles');
  return <RoutinesTabPage key={repository.owner} repo={repository} />;
}
