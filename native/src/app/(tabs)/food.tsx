import { useAuth } from '@/auth/provider';
import { LoadingPanel } from '@/components/loading-panel';
import { Screen } from '@/components/screen';
import { t } from '@/i18n/en';
import { FoodScreen } from '@/features/food/screen';
export default function Food() {
 const {repository}=useAuth();
 // The repository opens with the account; until it does there is nothing to log into yet, so the tab waits quietly.
 return <Screen title={t('food')} tabHeader>{repository?<FoodScreen key={repository.owner} repository={repository}/>:<LoadingPanel testID="food-loading"/>}</Screen>;
}
