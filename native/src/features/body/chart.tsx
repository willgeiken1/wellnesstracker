import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Button } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { useTheme } from '../../design/theme-provider';
import { t } from '../../i18n/en';
import { fromKg } from '../../core/workout/rules';
import type { Unit } from '../onboarding/model';
import { dayStamp, type TrendWeight } from './model';
export function BodyChart({points,raw,unit}:{points:TrendWeight[];raw:{day:string;kg:number}[];unit:Unit}) {
  const {colors}=useTheme();
  const [selected,setSelected]=useState<string|null>(null),[width,setWidth]=useState(300);
  if(!points.length)return <ThemedText muted>{t('bodyRangeEmpty')}</ThemedText>;
  const index=Math.max(0,selected===null?points.length-1:points.findIndex(p=>p.day===selected));
  const point=points[index],first=dayStamp(points[0].day),last=dayStamp(points.at(-1)!.day);
  const values=[...points.flatMap(p=>[p.kg,p.trendKg]),...raw.map(p=>p.kg)];
  const low=Math.min(...values)-0.5,high=Math.max(...values)+0.5;
  const x=(day:string)=>16+(dayStamp(day)-first)/Math.max(86400000,last-first)*268;
  const y=(kg:number)=>164-(kg-low)/(high-low)*144;
  const label=t('bodyPoint').replace('{day}',point.day).replace('{trend}',fromKg(point.trendKg,unit).toFixed(1)).replace('{average}',fromKg(point.kg,unit).toFixed(1)).replaceAll('{unit}',unit).replace('{count}',String(point.count));
  // No animations, transitions or programmatic scrolling, including Reduce Motion.
  return <View style={{gap:8}}>
    <Pressable testID="body-chart" accessibilityRole="button" accessibilityLabel={t('bodyChart')}
      onLayout={e=>setWidth(Math.max(1,e.nativeEvent.layout.width))}
      onPress={e=>{
        const location=e.nativeEvent?.locationX;
        if(!Number.isFinite(location))return;
        const plotX=location/width*300;
        const nearest=points.reduce((a,b)=>Math.abs(x(a.day)-plotX)<Math.abs(x(b.day)-plotX)?a:b);
        setSelected(nearest.day);
      }} style={{height:190}}>
      <Svg accessible={false} width="100%" height={190} viewBox="0 0 300 190" preserveAspectRatio="none">
        {raw.map((p,i)=><Circle key={i} cx={x(p.day)} cy={y(p.kg)} r={3} fill={colors.text} opacity={0.22}/>)}
        <Path d={points.map((p,i)=>`${i?'L':'M'}${x(p.day)},${y(p.trendKg)}`).join(' ')} fill="none" stroke={colors.accent} strokeWidth={2.5}/>
        <Circle cx={x(point.day)} cy={y(point.trendKg)} r={5} fill={colors.accent}/>
      </Svg>
    </Pressable>
    <View style={{flexDirection:'row',justifyContent:'space-between',flexWrap:'wrap'}}><ThemedText muted variant="caption">{points[0].day}</ThemedText><ThemedText muted variant="caption">{points.at(-1)!.day}</ThemedText></View>
    <ThemedText accessibilityLiveRegion="polite">{label}</ThemedText>
    <View style={{gap:8}}>
      <Button label={t('bodyPrevious')} variant="secondary" disabled={index===0} onPress={()=>setSelected(points[index-1].day)}/>
      <Button label={t('bodyNext')} variant="secondary" disabled={index===points.length-1} onPress={()=>setSelected(points[index+1].day)}/>
    </View>
  </View>;
}
