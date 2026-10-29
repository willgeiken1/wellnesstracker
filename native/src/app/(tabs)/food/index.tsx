import { useAuth } from '@/auth/provider';
import { Screen } from '@/components/screen';
import { t } from '@/i18n/en';
import { FoodScreen } from '@/features/food/screen';
export default function Food() {
 const {repository,configError}=useAuth();
 return <Screen title={t('food')} tabHeader><FoodScreen key={repository?.owner} repository={repository} error={configError}/></Screen>;
}
