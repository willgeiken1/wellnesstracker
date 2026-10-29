import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { ThemedText } from '../../components/themed-text';
import { useTheme } from '../../design/theme-provider';
import { t } from '../../i18n/en';
import type { Targets } from '../onboarding/model';
import type { Nutrient } from './model';
import { FoodLabel } from './presentation';

export function CalorieRing({total,target,estimated=false}:{total:Record<Nutrient,number|null>;target:Targets|null;estimated?:boolean}) {
 const {colors}=useTheme(),value=(n:number|null)=>n===null?'—':String(Math.round(n));
 const calories=value(total.energy_kj===null?null:total.energy_kj/4.184),goal=target?String(Math.round(target.energy_kj/4.184)):'—';
 const label=t('foodRing').replace('{calories}',calories).replace('{target}',goal).replace('{protein}',value(total.protein_g)).replace('{carbs}',value(total.carbs_g)).replace('{fat}',value(total.fat_g));
 const progress=(key:'energy_kj'|'protein_g'|'carbs_g'|'fat_g')=>target&&target[key]>0?Math.min(1,Math.max(0,(total[key]??0)/target[key])):0;
 const fraction=progress('energy_kj'),angle=Math.min(fraction,0.999999)*Math.PI*2-Math.PI/2;
 return <View style={{gap:8}}>
  <View accessible accessibilityRole="image" accessibilityLabel={label} style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:16}}>
   <View style={{width:108,height:108,alignItems:'center',justifyContent:'center'}}>
    <Svg width={108} height={108} viewBox="0 0 108 108" accessible={false} style={{position:'absolute'}}>
     <Circle cx={54} cy={54} r={46} fill="none" stroke={colors.bg} strokeWidth={8}/>
     {/* TODO INS-01: native pillar.food is pending; use the existing accent until the token save. */}
     {fraction>0&&<Path testID="food-calorie-arc" d={`M54,8 A46,46 0 ${fraction>0.5?1:0} 1 ${54+46*Math.cos(angle)},${54+46*Math.sin(angle)}`}
      fill="none" stroke={colors.accent} strokeWidth={8} strokeDasharray={estimated?'4 5':undefined}/>}
    </Svg>
   </View>
   <View style={{flex:1,minWidth:144,gap:8}}>
    <ThemedText numeric variant="title" style={{fontFamily:undefined}}>{calories} of {goal} kcal</ThemedText>
    {(['protein_g','carbs_g','fat_g'] as const).map((key,i)=><View key={key} style={{gap:4}}>
     <FoodLabel numeric>{['Protein','Carbs','Fat'][i]} · {value(total[key])}{target?` of ${value(target[key])}`:''} g</FoodLabel>
     <View style={{height:4,backgroundColor:colors.bg}}><View testID={`food-macro-${key}`} style={{height:4,width:`${progress(key)*100}%`,backgroundColor:colors.accent}}/></View>
    </View>)}
   </View>
  </View>
  {estimated&&<ThemedText muted>{t('foodEstimatedLegend')}</ThemedText>}
 </View>;
}
