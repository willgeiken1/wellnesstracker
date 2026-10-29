import { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput } from 'react-native';
import { Button } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { useTheme } from '../../design/theme-provider';
import { toKg } from '../../core/workout/rules';
import { t } from '../../i18n/en';
import type { Unit } from '../onboarding/model';
import { layout } from '../workout/primitives';
import { TonePanel } from './presentation';
import { unusualWeight } from './model';
export function WeightEntry({initial,unit,onSave,onClose}:{initial:number|null;unit:Unit;onSave:(value:number)=>void;onClose:()=>void}) {
  const {colors,reduceMotion}=useTheme();
  const [value,setValue]=useState(initial===null?'':initial.toFixed(1));
  const [keypad,setKeypad]=useState(initial===null),[base,setBase]=useState(initial??0);
  const [error,setError]=useState<'bodyInvalid'|'bodySaveFailed'|null>(null);
  const change=(next:string)=>{setValue(next);setError(null);};
  const adjust=(delta:number)=>change(Math.max(0.1,Number(value||0)+delta).toFixed(1));
  const start=Math.max(0.1,Math.round(base*10)/10-5);
  const initialIndex=Math.round((Math.max(0.1,base)-start)*10);
  const scrollChange=(offset:number)=>change((start+Math.min(100,Math.max(0,Math.round(offset/48)))/10).toFixed(1));
  return <TonePanel>
    {keypad?<TextInput autoFocus accessibilityLabel={t('bodyWeightInput').replace('{unit}',unit)} keyboardType="decimal-pad" value={value} onChangeText={change} style={[layout.input,{color:colors.text,backgroundColor:colors['surface-2']}]} />:<>
      <Pressable accessible onPress={()=>setKeypad(true)} accessibilityRole="adjustable" accessibilityLabel={t('bodyWheel').replace('{unit}',unit)} accessibilityValue={{text:`${value} ${unit}`}}
        accessibilityActions={[{name:'increment',label:t('bodyIncrease')},{name:'decrement',label:t('bodyDecrease')}]}
        onAccessibilityAction={e=>adjust(e.nativeEvent.actionName==='increment'?0.1:-0.1)}>
        <ThemedText numeric variant="title" style={{minHeight:48}}>{value} {unit}</ThemedText>
      </Pressable>
      <ScrollView key={`${start}:${unit}`} testID="body-wheel-scroll" style={{height:144}} nestedScrollEnabled
        accessibilityLabel={t('bodyWheel').replace('{unit}',unit)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        snapToInterval={48} decelerationRate={reduceMotion?0:'fast'} disableIntervalMomentum={reduceMotion}
        contentOffset={{x:0,y:initialIndex*48}} contentContainerStyle={{paddingVertical:48}}
        onScrollEndDrag={e=>scrollChange(e.nativeEvent.contentOffset.y)} onMomentumScrollEnd={e=>scrollChange(e.nativeEvent.contentOffset.y)}>
        {Array.from({length:101},(_,i)=>{const n=(start+i/10).toFixed(1);return <Pressable key={i} onPress={()=>change(n)} style={{height:48,justifyContent:'center',alignItems:'center',backgroundColor:n===value?colors['surface-2']:undefined}}><ThemedText numeric>{n} {unit}</ThemedText></Pressable>;})}
      </ScrollView>
    </>}
    <Button variant="secondary" label={t(keypad?'bodyUseWheel':'bodyKeypad')} onPress={()=>{if(keypad){if(!/^\d+(\.\d+)?$/.test(value)||!Number.isFinite(Number(value))||Number(value)<=0){setError('bodyInvalid');return;}setBase(Number(value));}setKeypad(!keypad);}}/>
    {error&&<ThemedText accessibilityRole="alert">{t(error)}</ThemedText>}
    <Button label={t('bodySave')} onPress={()=>{
      if(!/^\d+(\.\d+)?$/.test(value)||!Number.isFinite(Number(value))||Number(value)<=0){setError('bodyInvalid');return;}
      const save=()=>{try{onSave(Number(value));}catch{setError('bodySaveFailed');}};
      if(unusualWeight(Number(value),unit,initial===null?null:toKg(initial,unit))) {
        Alert.alert(t('bodyUnusual'),undefined,[{text:t('cancel'),style:'cancel'},{text:t('bodySaveAnyway'),onPress:save}]);
      } else save();
    }}/>
    <Button variant="secondary" label={t('cancel')} onPress={onClose}/>
  </TonePanel>;
}
