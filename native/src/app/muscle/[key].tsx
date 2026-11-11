import { Stack, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { muscleByKey } from '@/features/atlas/muscles';
import { t } from '@/i18n/en';
export default function MusclePage() {
 const {key}=useLocalSearchParams<{key:string}>();
 const muscle=muscleByKey.get(key);
 // Without these the header shows the route file name and the back button says "(tabs)". The name is the page title below.
 const header=<Stack.Screen options={{title:'',headerBackButtonDisplayMode:'minimal'}}/>;
 if(!muscle)return <>{header}<Screen title={t('atlasTitle')}><ThemedText accessibilityRole="alert">{t('atlasNotFound')}</ThemedText></Screen></>;
 return <>{header}<Screen title={muscle.name}>{muscle.scientific!==muscle.name&&<ThemedText>{muscle.scientific}</ThemedText>}<ThemedText>{t('atlasStub')}</ThemedText></Screen></>;
}
