import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, View, Pressable } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import { router } from 'expo-router';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { muscleLabel, t } from '@/i18n/en';
import { atlasGeometry, type BodyType, type Side } from './geometry';
import { AccessiblePath } from './accessible-path';
import { muscleByKey } from './muscles';
import { heatFill, heatmap, rollup, type AtlasSession, type MuscleVolume } from './volume';
export function atlasValue(value: MuscleVolume, now: number) {
 const hours=value.lastTrained===null?null:Math.max(0,(now-value.lastTrained)/3600000);
 const last=hours===null?t('atlasNever'):hours>7*24?t('atlasOutsideWindow').replace('{days}','7'):
  hours>=24&&hours<48?t('atlasDay'):
  hours>=48?t('atlasDays').replace('{days}',String(Math.floor(hours/24))):
  t('atlasHours').replace('{hours}',String(Math.floor(hours)));
 return t('atlasValue').replace('{sets}',String(value.sets)).replace('{min}',String(value.target[0])).replace('{max}',String(value.target[1])).replace('{last}',last);
}
export function atlasLabel(value: MuscleVolume, now: number) {
 const muscle=muscleByKey.get(value.key)!;
 return `${muscle.name} · ${muscle.scientific} · ${atlasValue(value,now)}`;
}
/** Responsive at any parent width. Compact previews retain controls and full list access.
 * Static rendering intentionally has no animation, including when Reduce Motion is on. */
export function BodyAtlas({ sessions, now, compact = false, haptics = true }: {
 sessions: AtlasSession[]; now: number; compact?: boolean; haptics?: boolean;
}) {
 const { colors, mode }=useTheme();
 const [body,setBody]=useState<BodyType>('male'),[side,setSide]=useState<Side>('front');
 const [list,setList]=useState(false),[selected,setSelected]=useState<string|null>(null);
 useEffect(()=>{
  let active=true;
  void AccessibilityInfo.isScreenReaderEnabled().then(enabled=>{if(active&&enabled)setList(true);}).catch(()=>{});
  const sub=AccessibilityInfo.addEventListener('screenReaderChanged',enabled=>{if(enabled)setList(true);});
  return ()=>{active=false;sub.remove();};
 },[]);
 const values=useMemo(()=>heatmap(sessions,now),[sessions,now]), geometry=atlasGeometry[body][side];
 const valuesByKey=useMemo(()=>new Map(values.map(value=>[value.key,value])),[values]);
 const current=selected?valuesByKey.get(selected):undefined;
 const select=(key: string)=>{
  setSelected(key);
  if(haptics) void impactAsync(ImpactFeedbackStyle.Light).catch(()=>{});
 };
 return <View style={{gap:12}}>
  <ThemedText accessibilityRole="header" variant="headline">{t('atlasTitle')}</ThemedText>
  <ThemedText muted>{t('atlasWindow')}</ThemedText>
  <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>
   {(['front','back'] as const).map(s=><Button key={s} label={t(s==='front'?'atlasFront':'atlasBack')} variant="secondary" selected={s===side} onPress={()=>setSide(s)}/>)}
   {(['male','female'] as const).map(b=><Button key={b} label={t(b==='male'?'atlasMale':'atlasFemale')} variant="secondary" selected={b===body} onPress={()=>setBody(b)}/>)}
   <Button label={t(list?'atlasMap':'atlasList')} variant="secondary" selected={list} onPress={()=>setList(!list)}/>
  </View>
  <ThemedText muted>{t('atlasHint')}</ThemedText>
  {!list && <View style={{width:'100%',maxWidth:compact?180:320,alignSelf:'center',aspectRatio:200/440}}>
   <Svg width="100%" height="100%" viewBox="0 0 200 440" accessible={false}>
    <G id="skin"><Path d={geometry.skin} fill={colors['surface-2']} stroke={colors['text-muted']} strokeWidth={1}/></G>
    {/* Enlarged strokes sit behind exact paths; overlapping targets use paint order.
        Non-scaling strokes retain a 44 pt target even in compact previews.
        The list remains the precise selection path for adjacent small regions. */}
    <G id="hit-targets">{geometry.muscles.map(path=><Path key={path.id}
     testID={`atlas-hit-${path.id}`} d={path.d} fill="transparent" stroke="transparent"
     strokeWidth={44} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
     accessible={false} onPress={()=>select(path.id)}/>)}</G>
    <G id="muscles">{geometry.muscles.map(path=>{
     const value=valuesByKey.get(path.id)!;
     return <AccessiblePath key={path.id} id={path.id} testID={`atlas-path-${path.id}`} d={path.d}
      fill={heatFill(value,mode==='dark')} fillOpacity={.65+.35*value.freshness}
      stroke={selected===path.id?colors.text:colors.bg} strokeWidth={selected===path.id?2.5:.8}
      accessible accessibilityRole="button" accessibilityState={{selected:selected===path.id}} accessibilityLabel={atlasLabel(value,now)}
      onPress={()=>select(path.id)}/>;
    })}</G>
   </Svg>
  </View>}
  <ThemedText muted>{t('atlasLegend')}</ThemedText>
  {list && values.map(value=><Pressable key={value.key} testID={`atlas-row-${value.key}`}
   accessibilityRole="button" accessibilityLabel={atlasLabel(value,now)} accessibilityState={{selected:selected===value.key}}
   onPress={()=>select(value.key)} style={{minHeight:48,padding:12,borderRadius:12,backgroundColor:colors.surface,borderWidth:selected===value.key?2:0,borderColor:colors.text}}>
    <View style={{flexDirection:'row',gap:8}}><View style={{width:12,height:12,marginTop:5,backgroundColor:heatFill(value,mode==='dark')}}/><ThemedText>{muscleByKey.get(value.key)!.name}</ThemedText></View>
    <ThemedText muted>{atlasValue(value,now)}</ThemedText>
   </Pressable>)}
  {current && <Card>
   <ThemedText accessibilityRole="header">{muscleByKey.get(current.key)!.name}</ThemedText>
   <ThemedText>{muscleByKey.get(current.key)!.scientific}</ThemedText>
   <ThemedText>{atlasValue(current,now)}</ThemedText>
   <Button label={t('atlasOpen')} onPress={()=>router.push({pathname:'/muscle/[key]',params:{key:current.key}})}/>
  </Card>}
  {!compact && <Card><ThemedText accessibilityRole="header">{t('atlasGroups')}</ThemedText>
   {Object.entries(rollup(values)).map(([group,sets])=><ThemedText key={group}>{muscleLabel(group)} · {sets}</ThemedText>)}
  </Card>}
 </View>;
}
