import { router } from 'expo-router';
import { Screen } from '@/components/screen';
import { EmptyState } from '@/components/empty-state';
import { t } from '@/i18n/en';
export default function Home() {
  return <Screen title={t('home')} tabHeader><EmptyState title={t('welcome')} description={t('welcomeBody')}
    action={{ label: t('startFreestyle'), onPress: () => router.push('/workout') }} /></Screen>;
}
