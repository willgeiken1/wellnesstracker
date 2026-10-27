import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { t } from '../../i18n/en';
import { FoodAction } from './action';
import { shiftDay } from './model';
export function FoodCalendar({day,today,onSelect}:{day:string;today:string;onSelect:(day:string)=>void}) {
 const [month,setMonth]=useState(day.slice(0,7));
 const first=`${month}-01`,next=shiftDay(first,32).slice(0,7)+'-01',length=Number(shiftDay(next,-1).slice(8));
 const weekday=new Date(`${first}T12:00:00Z`).getUTCDay();
 return <View style={{gap:8}}>
  <View style={{flexDirection:'row',gap:8}}><FoodAction label={t('foodPreviousMonth')} onPress={()=>setMonth(shiftDay(first,-1).slice(0,7))}>{'‹'}</FoodAction><ThemedText>{month}</ThemedText><FoodAction label={t('foodNextMonth')} disabled={month>=today.slice(0,7)} onPress={()=>setMonth(next.slice(0,7))}>{'›'}</FoodAction></View>
  <View style={{flexDirection:'row',flexWrap:'wrap'}}>
   {Array.from({length:weekday},(_,i)=><View key={`blank${i}`} style={{width:'14.28%'}}/>)}
   {Array.from({length},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`).map(date=><View key={date} style={{width:'14.28%',padding:1}}><FoodAction label={date} selected={date===day} disabled={date>today} onPress={()=>onSelect(date)}>{Number(date.slice(8))}</FoodAction></View>)}
  </View>
  <ThemedText>{t('foodLast14')}</ThemedText>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:4}}>{Array.from({length:14},(_,i)=>shiftDay(today,-i)).map(date=><Button key={date} label={date} variant="secondary" selected={date===day} onPress={()=>onSelect(date)}/>)}</View>
 </View>;
}
