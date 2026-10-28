import { FoodAiEntry } from './ai/entry';
import { FoodAiResults, FoodAiMorningReview, LocalMealThumbnail } from './ai/review';
import { aiState, attachFallback, confirmEstimate } from './ai/service';
import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import type { Repository } from '../../data/repository';
import { Button } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { t } from '../../i18n/en';
import { today } from '../onboarding/model';
import { Field } from '../onboarding/fields';
import { Panel } from '../workout/primitives';
import { useFoodRevision } from './use-food-revision';
import { FoodAction } from './action';
import { FoodEntry } from './entry';
import { FoodTargets } from './targets';
import { FoodCalendar } from './calendar';
import { CalorieRing } from './ring';
import { allFavorites, attributedDay, combos, copyYesterday, deleteFood, favorites, foodTargets, logCombo, meals, recentFoods, saveCombo, saveFood, saveMeal, saveReusable, shiftDay, toggleFavorite, totals, undoFood, type Food, type Undo } from './model';
export function FoodScreen({repository,initialManual=false}:{repository:Repository;initialManual?:boolean}) {
 // Repository reads are mutable method calls; do not memoize derived values by object identity.
 'use no memo';
 const [reviewClock,setReviewClock]=useState(()=>today()+':'+attributedDay());
 useEffect(()=>{const app=AppState.addEventListener('change',state=>{if(state==='active')setReviewClock(today()+':'+attributedDay());});return ()=>app.remove();},[]);
 const [fallbackId,setFallbackId]=useState<number|undefined>();
 const [aiMode,setAiMode]=useState<'snap'|'describe'|null>(null);
 const revision=useFoodRevision(repository),repo=repository;
 const [day,setDay]=useState(()=>attributedDay()),[calendar,setCalendar]=useState(false),[fan,setFan]=useState(false);
 const mealList=meals(repo),[selectedMeal,setSelectedMeal]=useState(mealList[0].id);
 const [entry,setEntry]=useState<{initial?:Food;id?:string;meal:string}|null>(initialManual?{meal:mealList[0].id}:null),[library,setLibrary]=useState(false);
 const [rename,setRename]=useState<{id?:string;name:string}|null>(null),[combo,setCombo]=useState<{meal:string;name:string}|null>(null);
 const [undo,setUndo]=useState<Undo|null>(null),[status,setStatus]=useState<string|null>(null);
 useEffect(()=>{if(!undo)return;const timer=setTimeout(()=>setUndo(null),8000);return ()=>clearTimeout(timer);},[undo]);
 const rows=repo.list('food_entries').filter(r=>r.data.day===day),total=totals(rows),targets=foodTargets(repo,day);
 const early=attributedDay()!==today();
 const chooseDay=(value:string)=>{setAiMode(null);setDay(value);setCalendar(false);setEntry(null);setUndo(null);setStatus(null);};
 const run=(action:()=>void)=>{try{action();setStatus(null);}catch{setStatus(t('foodFailure'));}};
 const log=(food:Food)=>run(()=>{saveFood(repo,day,selectedMeal,food);setLibrary(false);});
 return <View style={{gap:16}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
   <FoodAction label={t('foodPrevious')} onPress={()=>chooseDay(shiftDay(day,-1))}>{'‹'}</FoodAction>
   <View style={{flex:1}}><ThemedText variant="headline">{t('foodDay').replace('{day}',day)}</ThemedText><Button label={t('foodCalendar')} variant="secondary" onPress={()=>setCalendar(!calendar)}/></View>
   <FoodAction label={t('foodNext')} disabled={day>=today()} onPress={()=>chooseDay(shiftDay(day,1))}>{'›'}</FoodAction>
  </View>
  {calendar&&<FoodCalendar day={day} today={today()} onSelect={chooseDay}/>}
  {early&&(day===attributedDay()||day===today())&&<><ThemedText>{t('foodEarly').replace('{day}',day)}</ThemedText><Button variant="secondary" label={t(day===today()?'foodUsePrevious':'foodUseToday')} onPress={()=>chooseDay(day===today()?attributedDay():today())}/></>}
  <CalorieRing total={total} target={targets.targets} estimated={rows.some(row=>aiState(repo).entries[row.id]?.confirmed===false)}/>
  <FoodAiMorningReview key={reviewClock} repo={repo}/>
  <FoodAiResults repo={repo} onDescribe={id=>{const job=aiState(repo).fallback.find(j=>j.id===id)!;setDay(job.day);setSelectedMeal(job.meal);setFallbackId(id);setAiMode('describe');}} onManual={id=>{const job=aiState(repo).fallback.find(j=>j.id===id)!;setDay(job.day);setSelectedMeal(job.meal);setFallbackId(id);setAiMode(null);setEntry({meal:job.meal});}}/>
  <ThemedText muted>{t('foodBurned')}</ThemedText>
  <Panel><FoodTargets key={day} repo={repo} day={day} revision={revision}/></Panel>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:4}}>
   {(['foodSnap','foodDescribe','foodScan','foodManual','foodSaved'] as const).map(method=><View key={method} style={{flexGrow:1}}><Button label={t(method)} variant="secondary" onPress={()=>{
    if(method==='foodSnap'||method==='foodDescribe'){setAiMode(method==='foodSnap'?'snap':'describe');setEntry(null);setLibrary(false);}else if(method==='foodManual'){setEntry({meal:selectedMeal});setLibrary(false);}else if(method==='foodSaved'){setLibrary(!library);setEntry(null);}else setStatus(t('foodLater').replace('{method}',t(method)));
   }}/></View>)}
  </View>
  <FoodAction label={t('foodFan')} onPress={()=>setFan(!fan)}>{fan?'−':'+'}</FoodAction>
  {fan&&<View style={{gap:4}}>{(['foodSnap','foodDescribe','foodScan','foodManual','foodSaved'] as const).map(method=><Button key={method} label={'+ '+t(method)} variant="secondary" onPress={()=>{setFan(false);if(method==='foodSnap'||method==='foodDescribe'){setAiMode(method==='foodSnap'?'snap':'describe');setEntry(null);setLibrary(false);}else if(method==='foodManual')setEntry({meal:selectedMeal});else if(method==='foodSaved')setLibrary(true);else setStatus(t('foodLater').replace('{method}',t(method)));}}/>)}</View>}
  <ThemedText>{t('foodChooseMeal')}</ThemedText>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:4}}>{mealList.map(meal=><Button key={meal.id} label={meal.name} selected={selectedMeal===meal.id} variant="secondary" onPress={()=>{setSelectedMeal(meal.id);if(entry)setEntry({...entry,meal:meal.id});}}/>)}</View>
  {status&&<ThemedText accessibilityLiveRegion="polite">{status}</ThemedText>}
  {undo&&<Panel><ThemedText accessibilityLiveRegion="polite">{t('foodDeleted')}</ThemedText><Button label={t('foodUndo')} onPress={()=>run(()=>{if(!undoFood(repo,undo)){setUndo(null);throw new Error();}setUndo(null);})}/></Panel>}
  {aiMode&&<Panel><FoodAiEntry key={aiMode+day+selectedMeal} repo={repo} fallbackId={fallbackId} mode={aiMode} day={day} meal={selectedMeal} onClose={()=>setAiMode(null)} onManual={()=>{setAiMode(null);setEntry({meal:selectedMeal});}}/></Panel>}
  {entry&&<Panel><FoodEntry key={entry.id??'new'} initial={entry.initial} day={day} onClose={()=>setEntry(null)} onSave={(food,multiple)=>{const row=saveFood(repo,day,entry.meal,food,multiple,entry.id);if(fallbackId!==undefined){attachFallback(repo,row.id,fallbackId);setFallbackId(undefined);}if(entry.id&&aiState(repo).entries[entry.id])confirmEstimate(repo,entry.id);setEntry(null);}}/></Panel>}
  {library&&<Panel>
   {([{title:'foodSaved',foods:repo.list('saved_foods').map((r):Food=>({...r.data,saved_food_id:r.id,amount_g:r.data.serving_g??null}))},{title:'foodRecent',foods:recentFoods(repo)},{title:'foodFavorites',foods:allFavorites(repo,selectedMeal)}] as const).map(section=><View key={section.title} style={{gap:6}}><ThemedText variant="headline">{t(section.title)}</ThemedText>{!section.foods.length&&<ThemedText muted>{t('foodNoSaved')}</ThemedText>}{section.foods.map((food,i)=><Button key={i} variant="secondary" label={t('foodLogSaved').replace('{name}',String(food['name']))} onPress={()=>log(food)}/>)}</View>)}
   <ThemedText variant="headline">{t('foodCombos')}</ThemedText>{combos(repo).map((item,i)=><Button key={i} variant="secondary" label={t('foodLogSaved').replace('{name}',item.name)} onPress={()=>run(()=>{logCombo(repo,item,day,selectedMeal);setLibrary(false);})}/>)}
  </Panel>}
  {mealList.map(meal=><Panel key={meal.id}>
   <ThemedText variant="headline">{meal.name}</ThemedText>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:4}}>{favorites(repo,meal.id).map((food,i)=><Button key={i} label={t('foodLogSaved').replace('{name}',String(food.name))} variant="secondary" onPress={()=>run(()=>{saveFood(repo,day,meal.id,food);})}/>)}</View>
   <Button label={t('foodRename').replace('{name}',meal.name)} variant="secondary" onPress={()=>setRename({id:meal.id,name:meal.name})}/>
   {rows.filter(row=>row.data.meal_id===meal.id).map(row=><View key={row.id} style={{gap:6}}>
    <LocalMealThumbnail data={aiState(repo).entries[row.id]?.thumbnail}/>
    {aiState(repo).entries[row.id]?.confirmed===false&&<View style={{borderWidth:1,borderStyle:'dashed',padding:6}}><ThemedText>{t('foodAiPending')}</ThemedText><Button label={t('foodAiConfirm').replace('{name}',String(row.data.name))} variant="secondary" onPress={()=>confirmEstimate(repo,row.id)}/></View>}
    <ThemedText>{String(row.data.name)}</ThemedText><ThemedText>{t('foodEnergy').replace('{value}',row.data.energy_kj==null?'—':String(Math.round(Number(row.data.energy_kj)/4.184)))}</ThemedText>
    <Button label={t('foodEdit').replace('{name}',String(row.data.name))} variant="secondary" onPress={()=>{setSelectedMeal(meal.id);setEntry({id:row.id,initial:row.data,meal:meal.id});}}/>
    <Button label={t('foodDelete').replace('{name}',String(row.data.name))} variant="destructive" onPress={()=>run(()=>setUndo(deleteFood(repo,row.id)))}/>
    <Button label={t(allFavorites(repo,meal.id).some(f=>f.name===row.data.name)?'foodUnfavorite':'foodFavorite').replace('{name}',String(row.data.name))} variant="secondary" onPress={()=>run(()=>toggleFavorite(repo,meal.id,row.data))}/>
    <Button label={t('foodKeep').replace('{name}',String(row.data.name))} variant="secondary" onPress={()=>run(()=>{saveReusable(repo,row.data);})}/>
   </View>)}
   {!rows.some(r=>r.data.meal_id===meal.id)&&<ThemedText muted>{t('foodEmptyMeal')}</ThemedText>}
   <Button label={t('foodCopy').replace('{name}',meal.name)} variant="secondary" onPress={()=>run(()=>copyYesterday(repo,day,meal.id))}/>
   <Button label={t('foodSaveCombo').replace('{name}',meal.name)} variant="secondary" disabled={!rows.some(r=>r.data.meal_id===meal.id)} onPress={()=>setCombo({meal:meal.id,name:meal.name})}/>
  </Panel>)}
  <Button label={t('foodAddMeal')} variant="secondary" onPress={()=>setRename({name:''})}/>
  {rename&&<Panel><Field label={t('foodMealName')} value={rename.name} onChange={name=>setRename({...rename,name})}/><Button label={t('foodSaveMeal')} onPress={()=>run(()=>{saveMeal(repo,rename.name,rename.id);setRename(null);})}/><Button label={t('cancel')} variant="secondary" onPress={()=>setRename(null)}/></Panel>}
  {combo&&<Panel><Field label={t('foodComboName')} value={combo.name} onChange={name=>setCombo({...combo,name})}/><Button label={t('foodComboSave')} onPress={()=>run(()=>{saveCombo(repo,day,combo.meal,combo.name);setCombo(null);})}/><Button label={t('cancel')} variant="secondary" onPress={()=>setCombo(null)}/></Panel>}
  <Panel>{(['fiber_g','sugar_g','sodium_mg'] as const).map((key,i)=><ThemedText key={key}>{t((['foodFiber','foodSugar','foodSodium'] as const)[i])}{': '}{total[key]===null?'':String(Math.round(total[key]! *10)/10)}</ThemedText>)}<ThemedText muted>{t('foodUnknown')}</ThemedText></Panel>
 </View>;
}
