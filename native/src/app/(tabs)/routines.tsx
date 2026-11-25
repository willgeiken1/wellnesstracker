import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { showToast } from '@/features/shell/toast';
import { t } from '@/i18n/en';
/** Routines on the bar. The Routines page replaces this placeholder. */
export default function Routines() {
  return <Screen title={t('shellTab_routines')} tabHeader>
    <EmptyState title={t('shellAct_item')} description={t('shellHint_item')}
      action={{ label: t('shellAct_item'), onPress: () => showToast(t('shellNotYet'), { color: 'sleep' }) }} />
  </Screen>;
}
