import { FoodAiEntry } from './ai/entry';
import { FoodAiResults, FoodAiMorningReview, LocalMealThumbnail } from './ai/review';
import { aiState, attachFallback, confirmEstimate } from './ai/service';
import { useEffect, useState } from 'react';
import { AppState, Pressable, SectionList, View } from 'react-native';
import type { Repository } from '../../data/repository';
import { Button } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { t } from '../../i18n/en';
import { today } from '../onboarding/model';
import { Field } from '../onboarding/fields';
import { FoodPanel as Panel, FoodLabel, FoodLoading, FoodReadBoundary } from './presentation';
import { FoodTargetsSheet } from './targets-sheet';
import { WaterSlot } from './water-slot';
import { Icon } from '../../components/icon';
import { tokens } from '../../design/tokens';
import { useTheme } from '../../design/theme-provider';
import { useFoodRevision } from './use-food-revision';
import { FoodAction } from './action';
import { FoodScanner } from './scanner';
import { FoodEntry } from './entry';
import { FoodCalendar } from './calendar';
import { CalorieRing } from './ring';
import { allFavorites, attributedDay, combos, copyYesterday, deleteFood, favorites, foodTargets, logCombo, meals, recentFoods, saveCombo, saveFood, saveMeal, saveReusable, shiftDay, toggleFavorite, totals, undoFood, type Food, type Undo } from './model';
export function FoodScreen({repository,initialManual=false}:{repository:Repository|null;initialManual?:boolean}) {
 return repository?<FoodReadBoundary key={repository.owner}><FoodContent repository={repository} initialManual={initialManual}/></FoodReadBoundary>:<FoodLoading/>;
}
function FoodContent({repository,initialManual=false}:{repository:Repository;initialManual?:boolean}) {
 // Repository reads are mutable method calls; do not memoize derived values by object identity.
 'use no memo';
 const [reviewClock,setReviewClock]=useState(()=>today()+':'+attributedDay());
 useEffect(()=>{const app=AppState.addEventListener('change',state=>{if(state==='active')setReviewClock(today()+':'+attributedDay());});return ()=>app.remove();},[]);
 const [fallbackId,setFallbackId]=useState<number|undefined>();
 const [aiMode,setAiMode]=useState<'snap'|'describe'|null>(null);
 const [scanning,setScanning]=useState(false);
 const [mealOptions,setMealOptions]=useState<string|null>(null),[foodOptions,setFoodOptions]=useState<string|null>(null);
 const {colors}=useTheme();
 const revision=useFoodRevision(repository),repo=repository;
 const [day,setDay]=useState(()=>attributedDay()),[calendar,setCalendar]=useState(false),[targetsOpen,setTargetsOpen]=useState(false);
 const mealList=meals(repo),[selectedMeal,setSelectedMeal]=useState(mealList[0].id);
 const [entry,setEntry]=useState<{initial?:Food;id?:string;meal:string}|null>(initialManual?{meal:mealList[0].id}:null),[library,setLibrary]=useState(false);
 const [rename,setRename]=useState<{id?:string;name:string}|null>(null),[combo,setCombo]=useState<{meal:string;name:string}|null>(null);
 const [undo,setUndo]=useState<Undo|null>(null),[status,setStatus]=useState<string|null>(null);
 useEffect(()=>{if(!undo)return;const timer=setTimeout(()=>setUndo(null),8000);return ()=>clearTimeout(timer);},[undo]);
 const rows=repo.list('food_entries').filter(r=>r.data.day===day),total=totals(rows),targets=foodTargets(repo,day);
 const early=attributedDay()!==today();
 const chooseDay=(value:string)=>{setAiMode(null);setScanning(false);setDay(value);setCalendar(false);setEntry(null);setUndo(null);setStatus(null);};
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
  {repo.owner==='demo'&&<FoodLabel accessibilityLabel="Example data" style={{alignSelf:'flex-start',backgroundColor:colors['surface-2'],paddingHorizontal:8,paddingVertical:4,borderRadius:tokens.radii.input}}>Example data</FoodLabel>}
  <Panel><CalorieRing total={total} target={targets.targets} estimated={rows.some(row=>aiState(repo).entries[row.id]?.confirmed===false)}/><Button label="Food targets info" variant="secondary" onPress={()=>setTargetsOpen(true)}/></Panel>
  <FoodTargetsSheet repo={repo} day={day} revision={revision} open={targetsOpen} onClose={()=>setTargetsOpen(false)}/>
  <FoodAiMorningReview key={reviewClock} repo={repo}/>
  <FoodAiResults repo={repo} onDescribe={id=>{setScanning(false);setEntry(null);setLibrary(false);const job=aiState(repo).fallback.find(j=>j.id===id)!;setDay(job.day);setSelectedMeal(job.meal);setFallbackId(id);setAiMode('describe');}} onManual={id=>{setScanning(false);setLibrary(false);const job=aiState(repo).fallback.find(j=>j.id===id)!;setDay(job.day);setSelectedMeal(job.meal);setFallbackId(id);setAiMode(null);setEntry({meal:job.meal});}}/>
  <View testID="food-log-actions" style={{gap:8}}>
   <View style={{flexDirection:'row',backgroundColor:colors['surface-2'],borderRadius:tokens.radii.input,overflow:'hidden'}}>
    {(['foodSnap','foodScan','foodManual'] as const).map(method=><Pressable key={method} accessibilityRole="button" accessibilityLabel={t(method)} style={({pressed})=>({flex:1,minHeight:48,minWidth:44,padding:8,alignItems:'center',justifyContent:'center',opacity:pressed?0.7:1})} onPress={()=>{
     setAiMode(null);setScanning(false);setEntry(null);setLibrary(false);
     if(method==='foodScan')setScanning(true);
     else if(method==='foodSnap')setAiMode('snap');
     else setEntry({meal:selectedMeal});
    }}><FoodLabel>{t(method)}</FoodLabel></Pressable>)}
   </View>
   <View style={{flexDirection:'row',gap:8}}>
    <Button label={t('foodDescribe')} variant="secondary" onPress={()=>{setAiMode('describe');setScanning(false);setEntry(null);setLibrary(false);}}/>
    <Button label={t('foodSaved')} variant="secondary" onPress={()=>{setLibrary(!library);setEntry(null);setAiMode(null);setScanning(false);}}/>
   </View>
  </View>
  <WaterSlot/>
  <FoodLabel accessibilityRole="header">Meals</FoodLabel>
  {!rows.length&&<Panel><Icon name="food"/><FoodLabel>Nothing logged today</FoodLabel><Button label="Log breakfast" onPress={()=>{setSelectedMeal(mealList[0].id);setEntry({meal:mealList[0].id});setAiMode(null);setScanning(false);setLibrary(false);}}/></Panel>}
  <ThemedText>{t('foodChooseMeal')}</ThemedText>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:4}}>{mealList.map(meal=><Button key={meal.id} label={meal.name} selected={selectedMeal===meal.id} variant="secondary" onPress={()=>{setSelectedMeal(meal.id);if(entry)setEntry({...entry,meal:meal.id});}}/>)}</View>
  {status&&<ThemedText accessibilityLiveRegion="polite">{status}</ThemedText>}
  {undo&&<Panel><ThemedText accessibilityLiveRegion="polite">{t('foodDeleted')}</ThemedText><Button label={t('foodUndo')} onPress={()=>run(()=>{if(!undoFood(repo,undo)){setUndo(null);throw new Error();}setUndo(null);})}/></Panel>}
  {scanning&&<Panel><FoodScanner repo={repo} onChoose={food=>{setEntry({meal:selectedMeal,initial:food});setScanning(false);}} onManual={()=>{setEntry({meal:selectedMeal});setScanning(false);}} onClose={()=>setScanning(false)}/></Panel>}
  {aiMode&&<Panel><FoodAiEntry key={aiMode+day+selectedMeal} repo={repo} fallbackId={fallbackId} mode={aiMode} day={day} meal={selectedMeal} onClose={()=>setAiMode(null)} onManual={()=>{setAiMode(null);setEntry({meal:selectedMeal});}}/></Panel>}
  {entry&&<Panel><FoodEntry key={entry.id??'new'} initial={entry.initial} day={day} onClose={()=>setEntry(null)} onSave={(food,multiple)=>{const row=saveFood(repo,day,entry.meal,food,multiple,entry.id);if(fallbackId!==undefined){attachFallback(repo,row.id,fallbackId);setFallbackId(undefined);}if(entry.id&&aiState(repo).entries[entry.id])confirmEstimate(repo,entry.id);setEntry(null);}}/></Panel>}
  {library&&<Panel>
   {([{title:'foodSaved',foods:repo.list('saved_foods').map((r):Food=>({...r.data,saved_food_id:r.id,amount_g:r.data.serving_g??null}))},{title:'foodRecent',foods:recentFoods(repo)},{title:'foodFavorites',foods:allFavorites(repo,selectedMeal)}] as const).map(section=><View key={section.title} style={{gap:6}}><ThemedText variant="headline">{t(section.title)}</ThemedText>{!section.foods.length&&<ThemedText muted>{t('foodNoSaved')}</ThemedText>}{section.foods.map((food,i)=><Button key={i} variant="secondary" label={t('foodLogSaved').replace('{name}',String(food['name']))} onPress={()=>log(food)}/>)}</View>)}
   <ThemedText variant="headline">{t('foodCombos')}</ThemedText>{combos(repo).map((item,i)=><Button key={i} variant="secondary" label={t('foodLogSaved').replace('{name}',item.name)} onPress={()=>run(()=>{logCombo(repo,item,day,selectedMeal);setLibrary(false);})}/>)}
  </Panel>}
  <SectionList testID="food-meals" scrollEnabled={false} sections={mealList.map(meal=>({key:meal.id,data:[meal]}))} keyExtractor={meal=>meal.id} renderItem={({item:meal})=><View style={{gap:8,paddingVertical:16}}>
   <FoodLabel accessibilityRole="header">{meal.name}</FoodLabel>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:4}}>{favorites(repo,meal.id).map((food,i)=><Button key={i} label={t('foodLogSaved').replace('{name}',String(food.name))} variant="secondary" onPress={()=>run(()=>{saveFood(repo,day,meal.id,food);})}/>)}</View>
   <Button label={`Options for ${meal.name}`} variant="secondary" onPress={()=>setMealOptions(mealOptions===meal.id?null:meal.id)}/>
   {mealOptions===meal.id&&<Button label={t('foodRename').replace('{name}',meal.name)} variant="secondary" onPress={()=>setRename({id:meal.id,name:meal.name})}/>}
   {rows.filter(row=>row.data.meal_id===meal.id).map(row=><View key={row.id} style={{gap:6,paddingVertical:8}}>
    <LocalMealThumbnail data={aiState(repo).entries[row.id]?.thumbnail}/>
    {aiState(repo).entries[row.id]?.confirmed===false&&<View style={{borderWidth:1,borderStyle:'dashed',padding:6}}><ThemedText>{t('foodAiPending')}</ThemedText><Button label={t('foodAiConfirm').replace('{name}',String(row.data.name))} variant="secondary" onPress={()=>confirmEstimate(repo,row.id)}/></View>}
    <Pressable accessibilityRole="button" accessibilityLabel={`Details for ${String(row.data.name)}`} accessibilityState={{expanded:foodOptions===row.id}} onPress={()=>setFoodOptions(foodOptions===row.id?null:row.id)} style={({pressed})=>({minHeight:48,gap:4,opacity:pressed?0.7:1})}>
     <FoodLabel>{String(row.data.name)}</FoodLabel><ThemedText numeric>{row.data.amount_g==null?'Amount not recorded':`${row.data.amount_g} g`} · {t('foodEnergy').replace('{value}',row.data.energy_kj==null?'—':String(Math.round(Number(row.data.energy_kj)/4.184)))}</ThemedText>
    </Pressable>
    {foodOptions===row.id&&<>
    <Button label={t('foodEdit').replace('{name}',String(row.data.name))} variant="secondary" onPress={()=>{setAiMode(null);setScanning(false);setSelectedMeal(meal.id);setEntry({id:row.id,initial:row.data,meal:meal.id});}}/>
    <Button label={t('foodDelete').replace('{name}',String(row.data.name))} variant="destructive" onPress={()=>run(()=>setUndo(deleteFood(repo,row.id)))}/>
    <Button label={t(allFavorites(repo,meal.id).some(f=>f.name===row.data.name)?'foodUnfavorite':'foodFavorite').replace('{name}',String(row.data.name))} variant="secondary" onPress={()=>run(()=>toggleFavorite(repo,meal.id,row.data))}/>
    <Button label={t('foodKeep').replace('{name}',String(row.data.name))} variant="secondary" onPress={()=>run(()=>{saveReusable(repo,row.data);})}/></>}
   <MealSeparator/>
   </View>)}
   {!rows.some(r=>r.data.meal_id===meal.id)&&<ThemedText muted>{t('foodEmptyMeal')}</ThemedText>}
   {mealOptions===meal.id&&<><Button label={t('foodCopy').replace('{name}',meal.name)} variant="secondary" onPress={()=>run(()=>copyYesterday(repo,day,meal.id))}/>
   <Button label={t('foodSaveCombo').replace('{name}',meal.name)} variant="secondary" disabled={!rows.some(r=>r.data.meal_id===meal.id)} onPress={()=>setCombo({meal:meal.id,name:meal.name})}/></>}
  </View>} renderSectionFooter={()=> <MealSeparator/>}/>
  <Button label={t('foodAddMeal')} variant="secondary" onPress={()=>setRename({name:''})}/>
  {rename&&<Panel><Field label={t('foodMealName')} value={rename.name} onChange={name=>setRename({...rename,name})}/><Button label={t('foodSaveMeal')} onPress={()=>run(()=>{saveMeal(repo,rename.name,rename.id);setRename(null);})}/><Button label={t('cancel')} variant="secondary" onPress={()=>setRename(null)}/></Panel>}
  {combo&&<Panel><Field label={t('foodComboName')} value={combo.name} onChange={name=>setCombo({...combo,name})}/><Button label={t('foodComboSave')} onPress={()=>run(()=>{saveCombo(repo,day,combo.meal,combo.name);setCombo(null);})}/><Button label={t('cancel')} variant="secondary" onPress={()=>setCombo(null)}/></Panel>}
  <Panel>{(['fiber_g','sugar_g','sodium_mg'] as const).map((key,i)=><ThemedText key={key}>{t((['foodFiber','foodSugar','foodSodium'] as const)[i])}{': '}{total[key]===null?'':String(Math.round(total[key]! *10)/10)}</ThemedText>)}<ThemedText muted>{t('foodUnknown')}</ThemedText></Panel>
 </View>;
}

function MealSeparator(){const {colors}=useTheme();return <View style={{height:1,backgroundColor:colors['surface-2']}}/>;}
