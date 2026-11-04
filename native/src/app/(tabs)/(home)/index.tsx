import { router } from 'expo-router';
import { Screen } from '@/components/screen';
import { EmptyState } from '@/components/empty-state';
import { useWorkout } from '@/features/workout/use-workout';
import { Button } from '@/components/button';
import { WeekStrip } from '@/features/workout/days';
import { t } from '@/i18n/en';
export default function Home() {
  const {store}=useWorkout();
  return <Screen title={t('home')} tabHeader><WeekStrip />{store?.active()&&<Button label={t('resumeWorkout')} onPress={()=>router.push('/workout')}/>}<EmptyState title={t('welcome')} description={t('welcomeBody')}
    action={{ label: t('startFreestyle'), onPress: () => router.push('/workout') }} /></Screen>;
}
