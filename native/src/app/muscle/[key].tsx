import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { muscleByKey } from '@/features/atlas/muscles';
import { t } from '@/i18n/en';
export default function MusclePage() {
 const {key}=useLocalSearchParams<{key:string}>();
 const muscle=muscleByKey.get(key);
 if(!muscle)return <Screen title={t('atlasTitle')}><ThemedText accessibilityRole="alert">{t('atlasNotFound')}</ThemedText></Screen>;
 return <Screen title={muscle.name}><ThemedText>{muscle.scientific}</ThemedText><ThemedText>{t('atlasStub')}</ThemedText></Screen>;
}
