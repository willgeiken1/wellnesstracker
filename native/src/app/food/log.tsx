import { router } from 'expo-router';
import { Button } from '@/components/button';
import { useAuth } from '@/auth/provider';
import { Screen } from '@/components/screen';
import { t } from '@/i18n/en';
import { FoodScreen } from '@/features/food/screen';
export default function FoodLog() {
 const {repository}=useAuth();
 return <Screen title={t('foodLog')}>{repository&&<FoodScreen key={repository.owner} repository={repository} initialManual/>}<Button label={t('backHome')} variant="secondary" onPress={()=>router.navigate('/')}/></Screen>;
}
