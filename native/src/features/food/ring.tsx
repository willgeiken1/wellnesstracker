import { View } from 'react-native';
import Svg from 'react-native-svg';
import { RingArc } from '../../components/ring-arc';
import { IN_RING_MAX, useOutgrowsRing } from '../../components/text-size';
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
/** Room inside the smallest ring (fat: radius 53, 5 wide), less a little air. */
const INNER = 2 * (53 - 5 / 2) - 4;

/** Calories on the outer ring with what is left in the middle; protein, carbs and fat ride inside it. */
/** `logged` says the day has entries. With entries but no calories on any of them, the middle says so instead of counting them as zero. */
export function CalorieRing({total,target,estimated=false,logged=false}:{total:Record<Nutrient,number|null>;target:Targets|null;estimated?:boolean;logged?:boolean}) {
 const {colors,mode,ringLook,ringMotion,intensity}=useTheme(),value=(n:number|null)=>n===null?'—':String(Math.round(n));
 const eaten=total.energy_kj===null?null:total.energy_kj/4.184,goal=target?target.energy_kj/4.184:null;
 const label=t('foodRing').replace('{calories}',value(eaten)).replace('{target}',goal===null?'—':String(Math.round(goal))).replace('{protein}',value(total.protein_g)).replace('{carbs}',value(total.carbs_g)).replace('{fat}',value(total.fat_g));
 const unknown=logged&&eaten===null;
 const left=goal===null||unknown?null:Math.round(goal)-Math.round(eaten??0);
 const middle=left===null?value(eaten):whole(Math.abs(left)),caption=t(unknown?'foodKcalUnknown':left===null?'foodKcal':left>=0?'foodKcalLeft':'foodKcalOver');
 // The ring is a fixed size, so its middle grows only a little with large text; past that the same value is written in full below it.
 const outgrown=useOutgrowsRing();
 const macros=[['foodMacroProtein','protein_g','training'],['foodMacroCarbs','carbs_g','food'],['foodMacroFat','fat_g','sleep']] as const;
 return <View accessible accessibilityRole="image" accessibilityLabel={label} style={{alignItems:'center',gap:tokens.spacing[2]}}>
  <View style={{width:SIZE,height:SIZE,alignItems:'center',justifyContent:'center'}}>
   <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} accessible={false} style={{position:'absolute'}}>
    {RINGS.map(ring=>{const progress=target&&target[ring.key]>0?Math.min(1,Math.max(0,(total[ring.key]??0)/target[ring.key])):0;
     return <RingArc key={ring.key} testID={`food-ring-${ring.key}`} look={ringLook} cx={CENTER} cy={CENTER} r={ring.radius} width={ring.width} progress={progress}
      color={colors[ring.pillar]} track={colors['surface-2']} ink={colors.text} dark={mode==='dark'} dashed={estimated} echoes={false} motion={ringMotion} intensity={intensity}/>;})}
   </Svg>
   <View style={{maxWidth:INNER,alignItems:'center'}}>
    <ThemedText testID="food-ring-middle" numeric maxFontSizeMultiplier={IN_RING_MAX} numberOfLines={1} adjustsFontSizeToFit style={{fontSize:30,lineHeight:34,fontWeight:'600'}}>{middle}</ThemedText>
    <ThemedText muted variant="caption" maxFontSizeMultiplier={IN_RING_MAX} style={{textAlign:'center'}}>{caption}</ThemedText>
   </View>
  </View>
  {outgrown&&<ThemedText testID="food-ring-full" numeric style={{fontWeight:'600',textAlign:'center'}}>{middle} <ThemedText muted>{caption}</ThemedText></ThemedText>}
  <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',columnGap:tokens.spacing[3],rowGap:tokens.spacing[0]}}>
   {macros.map(([name,key,pillar])=><View key={key} style={{flexDirection:'row',alignItems:'center',gap:5}}>
    <View style={{width:8,height:8,borderRadius:4,backgroundColor:colors[pillar]}}/>
    <ThemedText variant="caption">{t(name)} <ThemedText numeric variant="caption" style={{fontWeight:'600'}}>{value(total[key])}</ThemedText><ThemedText muted numeric variant="caption">{target?`/${Math.round(target[key])}`:''}</ThemedText></ThemedText>
   </View>)}
  </View>
  {estimated&&<ThemedText muted variant="caption">{t('foodEstimatedLegend')}</ThemedText>}
 </View>;
}
