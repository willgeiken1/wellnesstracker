import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Panel, PROTOTYPE_RADIUS } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { muscleByKey } from '@/features/atlas/muscles';
import { muscleLabel, t } from '@/i18n/en';
const card = { borderRadius: PROTOTYPE_RADIUS, padding: tokens.spacing[3] } as const;
export default function MusclePage() {
 const {key}=useLocalSearchParams<{key:string}>();
 const {colors}=useTheme();
 const muscle=muscleByKey.get(key);
 // Without these the header shows the route file name and the back button says "(tabs)". The name is the page title below.
 const header=<Stack.Screen options={{title:'',headerBackButtonDisplayMode:'minimal'}}/>;
 if(!muscle)return <>{header}<Screen title={t('atlasTitle')}><Panel testID="muscle-missing" style={card}><ThemedText accessibilityRole="alert">{t('atlasNotFound')}</ThemedText></Panel></Screen></>;
 const group=muscleLabel(muscle.group);
 // A fact that only repeats the name above is left out.
 const facts=[
  ...(muscle.scientific!==muscle.name?[[t('musclePageScientific'),muscle.scientific]]:[]),
  ...(group!==muscle.name&&group!==muscle.scientific?[[t('musclePageGroup'),group]]:[]),
 ];
 return <>{header}<Screen title={muscle.name}>
  {facts.length>0&&<Panel testID="muscle-facts" style={[card,{gap:0,paddingVertical:tokens.spacing[0]}]}>
   {facts.map(([label,value],index)=><View key={label} accessible accessibilityLabel={`${label}: ${value}`}
    style={{minHeight:48,paddingVertical:tokens.spacing[1],flexDirection:'row',alignItems:'center',gap:tokens.spacing[2],borderTopWidth:index?1:0,borderTopColor:colors['surface-2']}}>
    <ThemedText muted style={{flex:1}}>{label}</ThemedText>
    <ThemedText style={{flex:1,fontWeight:'600',textAlign:'right'}}>{value}</ThemedText>
   </View>)}
  </Panel>}
  <ThemedText muted variant="caption">{t('atlasStub')}</ThemedText>
 </Screen></>;
}
