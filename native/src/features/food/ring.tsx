import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { ThemedText } from '../../components/themed-text';
import { useTheme } from '../../design/theme-provider';
import { tokens } from '../../design/tokens';
import { t } from '../../i18n/en';
import type { Targets } from '../onboarding/model';
import type { Nutrient } from './model';

const SIZE = 200, CENTER = SIZE / 2;
const RINGS = [
 { key: 'energy_kj', radius: 88, width: 12, pillar: 'food' },
 { key: 'protein_g', radius: 71, width: 5, pillar: 'training' },
 { key: 'carbs_g', radius: 62, width: 5, pillar: 'food' },
 { key: 'fat_g', radius: 53, width: 5, pillar: 'sleep' },
] as const;
const whole = (n: number) => Math.round(n).toLocaleString('en-US');

/** Calories on the outer ring with what is left in the middle; protein, carbs and fat ride inside it. */
/** `logged` says the day has entries. With entries but no calories on any of them, the middle says so instead of counting them as zero. */
export function CalorieRing({total,target,estimated=false,logged=false}:{total:Record<Nutrient,number|null>;target:Targets|null;estimated?:boolean;logged?:boolean}) {
 const {colors,mode}=useTheme(),value=(n:number|null)=>n===null?'—':String(Math.round(n));
 const eaten=total.energy_kj===null?null:total.energy_kj/4.184,goal=target?target.energy_kj/4.184:null;
 const label=t('foodRing').replace('{calories}',value(eaten)).replace('{target}',goal===null?'—':String(Math.round(goal))).replace('{protein}',value(total.protein_g)).replace('{carbs}',value(total.carbs_g)).replace('{fat}',value(total.fat_g));
 const unknown=logged&&eaten===null;
 const left=goal===null||unknown?null:Math.round(goal)-Math.round(eaten??0);
 const macros=[['foodMacroProtein','protein_g','training'],['foodMacroCarbs','carbs_g','food'],['foodMacroFat','fat_g','sleep']] as const;
 return <View accessible accessibilityRole="image" accessibilityLabel={label} style={{alignItems:'center',gap:tokens.spacing[2]}}>
  <View style={{width:SIZE,height:SIZE,alignItems:'center',justifyContent:'center'}}>
   <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} accessible={false} style={{position:'absolute'}}>
    {RINGS.map(ring=><Circle key={ring.key+'base'} cx={CENTER} cy={CENTER} r={ring.radius} fill="none" stroke={colors['surface-2']} strokeWidth={ring.width}/>)}
    {RINGS.map(ring=>{const progress=target&&target[ring.key]>0?Math.min(1,Math.max(0,(total[ring.key]??0)/target[ring.key])):0;
     if(!progress)return null;
     const angle=Math.min(progress,0.999999)*Math.PI*2-Math.PI/2,r=ring.radius;
     return <Path key={ring.key} d={`M${CENTER},${CENTER-r} A${r},${r} 0 ${progress>0.5?1:0} 1 ${CENTER+r*Math.cos(angle)},${CENTER+r*Math.sin(angle)}`} fill="none" stroke={tokens.color.pillar[ring.pillar][mode]} strokeWidth={ring.width} strokeLinecap={estimated?'butt':'round'} strokeDasharray={estimated?'4 5':undefined}/>;})}
   </Svg>
   <ThemedText numeric style={{fontSize:30,lineHeight:34,fontWeight:'600'}}>{left===null?value(eaten):whole(Math.abs(left))}</ThemedText>
   <ThemedText muted variant="caption">{t(unknown?'foodKcalUnknown':left===null?'foodKcal':left>=0?'foodKcalLeft':'foodKcalOver')}</ThemedText>
  </View>
  <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',columnGap:tokens.spacing[3],rowGap:tokens.spacing[0]}}>
   {macros.map(([name,key,pillar])=><View key={key} style={{flexDirection:'row',alignItems:'center',gap:5}}>
    <View style={{width:8,height:8,borderRadius:4,backgroundColor:tokens.color.pillar[pillar][mode]}}/>
    <ThemedText variant="caption">{t(name)} <ThemedText numeric variant="caption" style={{fontWeight:'600'}}>{value(total[key])}</ThemedText><ThemedText muted numeric variant="caption">{target?`/${Math.round(target[key])}`:''}</ThemedText></ThemedText>
   </View>)}
  </View>
  {estimated&&<ThemedText muted variant="caption">{t('foodEstimatedLegend')}</ThemedText>}
 </View>;
}
