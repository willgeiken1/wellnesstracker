import { router } from 'expo-router';
import { EmptyState } from '@/components/empty-state';
import { useAuth } from '@/auth/provider';
import { Screen } from '@/components/screen';
import { t } from '@/i18n/en';
import { FoodScreen } from '@/features/food/screen';
export default function Food() {
 const {repository}=useAuth();
 return <Screen title={t('food')} tabHeader>{repository?<FoodScreen key={repository.owner} repository={repository}/>:<EmptyState title={t('food')} action={{label:t('logFood'),onPress:()=>router.push('/food/log')}}/>}</Screen>;
}
