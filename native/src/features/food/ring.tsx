import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { ThemedText } from '../../components/themed-text';
import { useTheme } from '../../design/theme-provider';
import { t } from '../../i18n/en';
import type { Targets } from '../onboarding/model';
import type { Nutrient } from './model';
export function CalorieRing({total,target,estimated=false}:{total:Record<Nutrient,number|null>;target:Targets|null;estimated?:boolean}) {
 const {colors}=useTheme(),value=(n:number|null)=>n===null?'—':String(Math.round(n));
 const label=t('foodRing').replace('{calories}',value(total.energy_kj===null?null:total.energy_kj/4.184)).replace('{target}',target?String(Math.round(target.energy_kj/4.184)):'—').replace('{protein}',value(total.protein_g)).replace('{carbs}',value(total.carbs_g)).replace('{fat}',value(total.fat_g));
 const keys=['energy_kj','protein_g','carbs_g','fat_g'] as const;
 return <View accessible accessibilityRole="image" accessibilityLabel={label} style={{alignItems:'center',gap:8}}>
  <Svg width={180} height={180} viewBox="0 0 180 180" accessible={false}>
   {keys.map((key,i)=>{const radius=78-i*15;
    return <Circle key={key+'base'} cx={90} cy={90} r={radius} fill="none" stroke={colors['surface-2']} strokeWidth={9}/>;})}
   {keys.map((key,i)=>{const radius=78-i*15,progress=target&&target[key]>0?Math.min(1,Math.max(0,(total[key]??0)/target[key])):0;
    if(!progress)return null;
    const angle=Math.min(progress,0.999999)*Math.PI*2-Math.PI/2;
    return <Path key={key} d={`M90,${90-radius} A${radius},${radius} 0 ${progress>0.5?1:0} 1 ${90+radius*Math.cos(angle)},${90+radius*Math.sin(angle)}`} fill="none" stroke={i===0?colors.accent:colors.text} opacity={1-i*0.16} strokeWidth={8} strokeDasharray={estimated?'4 5':undefined}/>;})}
  </Svg>
  <ThemedText>{label}</ThemedText>
  {estimated&&<ThemedText muted>{t('foodEstimatedLegend')}</ThemedText>}
 </View>;
}
