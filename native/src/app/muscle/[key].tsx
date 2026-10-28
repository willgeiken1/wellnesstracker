import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { atlasMuscles } from '@/features/atlas/muscles';
import { t } from '@/i18n/en';
export default function MusclePage() {
 const {key}=useLocalSearchParams<{key:string}>();
 const muscle=atlasMuscles.find(m=>m.key===key);
 return <Screen title={muscle?.name??t('atlasTitle')}><ThemedText>{muscle?.scientific}</ThemedText><ThemedText>{t('atlasStub')}</ThemedText></Screen>;
}
