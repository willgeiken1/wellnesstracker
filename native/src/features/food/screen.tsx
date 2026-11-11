import { FoodAiEntry } from './ai/entry';
import { FoodAiResults, FoodAiMorningReview, LocalMealThumbnail } from './ai/review';
import { aiState, attachFallback, confirmEstimate } from './ai/service';
import { useEffect, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Card } from '../../components/card';
import { useTheme } from '../../design/theme-provider';
import { tokens } from '../../design/tokens';
import type { Repository } from '../../data/repository';
import { Button, touchTarget } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { t } from '../../i18n/en';
import { today } from '../onboarding/model';
import { Field } from '../onboarding/fields';
import { useFoodRevision } from './use-food-revision';
import { FoodScanner } from './scanner';
import { FoodEntry } from './entry';
import { FoodTargets } from './targets';
import { FoodCalendar } from './calendar';
import { CalorieRing } from './ring';
import { allFavorites, attributedDay, combos, copyYesterday, deleteFood, favorites, foodTargets, logCombo, meals, recentFoods, saveCombo, saveFood, saveMeal, saveReusable, shiftDay, toggleFavorite, totals, undoFood, type Food, type Undo } from './model';
const METHODS=['foodSnap','foodDescribe','foodScan','foodManual','foodSaved'] as const;
type Method=typeof METHODS[number];
const METHOD_ICON:Record<Method,string>={
 foodSnap:'M4 8h3l1.5-2h7L17 8h3v11H4zM12 10.5a3 3 0 1 0 0 6a3 3 0 0 0 0-6',
 foodDescribe:'M4 5h16v11H10l-5 4v-4H4z',
 foodScan:'M4 6v12M7.5 6v12M10.5 6v12M14 6v12M17 6v12M20 6v12',
 foodManual:'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3',
 foodSaved:'M12 4l2.5 5.2 5.5.8-4 4 1 5.6-5-2.7-5 2.7 1-5.6-4-4 5.5-.8z',
};
const card={borderRadius:18,padding:tokens.spacing[3]} as const;
const kcal=(kj:unknown)=>kj==null?null:Math.round(Number(kj)/4.184);
const gram=(value:unknown)=>value==null?'—':String(Math.round(Number(value)));
function dayTitle(day:string){
 if(day===today())return t('foodToday');
 if(day===shiftDay(today(),-1))return t('foodYesterday');
 const date=new Date(`${day}T12:00:00`);
 return Number.isNaN(date.getTime())?day:date.toLocaleDateString('en-US',{weekday:'long'});
}
function dayDate(day:string){
 const date=new Date(`${day}T12:00:00`);
 return Number.isNaN(date.getTime())?day:date.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
}
function Round({label,glyph,disabled=false,filled=false,onPress}:{label:string;glyph:string;disabled?:boolean;filled?:boolean;onPress:()=>void}) {
 const {colors}=useTheme();
 return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
  style={{width:touchTarget,height:touchTarget,alignItems:'center',justifyContent:'center',opacity:disabled?0.35:1}}>
  <View style={{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:filled?colors.accent:colors.surface}}>
   <Svg width={18} height={18} viewBox="0 0 24 24" accessible={false}><Path d={glyph} fill="none" stroke={filled?colors['on-accent']:colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></Svg>
  </View>
 </Pressable>;
}
function Pick({label,selected,onPress}:{label:string;selected:boolean;onPress:()=>void}) {
 const {colors}=useTheme();
 return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected}} onPress={onPress} style={{minHeight:touchTarget,justifyContent:'center'}}>
  <View style={{minHeight:34,paddingHorizontal:14,borderRadius:99,justifyContent:'center',backgroundColor:selected?colors.accent:colors.surface}}>
   <ThemedText style={{fontSize:15,color:selected?colors['on-accent']:colors.text}}>{label}</ThemedText>
  </View>
 </Pressable>;
}
/** A short visible word with the full sentence as its spoken label. */
function Act({text,label,danger=false,disabled=false,onPress}:{text:string;label:string;danger?:boolean;disabled?:boolean;onPress:()=>void}) {
 const {colors}=useTheme();
 return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={{minHeight:touchTarget,justifyContent:'center',opacity:disabled?0.4:1}}>
  <View style={{minHeight:34,paddingHorizontal:14,borderRadius:99,justifyContent:'center',backgroundColor:colors['surface-2']}}>
   <ThemedText style={{fontSize:15,color:danger?colors.danger:colors.text}}>{text}</ThemedText>
  </View>
 </Pressable>;
}
export function FoodScreen({repository,initialManual=false}:{repository:Repository;initialManual?:boolean}) {
 // Repository reads are mutable method calls; do not memoize derived values by object identity.
 'use no memo';
 const [reviewClock,setReviewClock]=useState(()=>today()+':'+attributedDay());
 useEffect(()=>{const app=AppState.addEventListener('change',state=>{if(state==='active')setReviewClock(today()+':'+attributedDay());});return ()=>app.remove();},[]);
 const [fallbackId,setFallbackId]=useState<number|undefined>();
 const [aiMode,setAiMode]=useState<'snap'|'describe'|null>(null);
 const [scanning,setScanning]=useState(false);
 const revision=useFoodRevision(repository),repo=repository;
 const [day,setDay]=useState(()=>attributedDay()),[calendar,setCalendar]=useState(false),[fan,setFan]=useState(false);
 const mealList=meals(repo),[selectedMeal,setSelectedMeal]=useState(mealList[0].id);
 const [entry,setEntry]=useState<{initial?:Food;id?:string;meal:string}|null>(initialManual?{meal:mealList[0].id}:null),[library,setLibrary]=useState(false);
 const [rename,setRename]=useState<{id?:string;name:string}|null>(null),[combo,setCombo]=useState<{meal:string;name:string}|null>(null);
 const [undo,setUndo]=useState<Undo|null>(null),[status,setStatus]=useState<string|null>(null);
 useEffect(()=>{if(!undo)return;const timer=setTimeout(()=>setUndo(null),8000);return ()=>clearTimeout(timer);},[undo]);
 const rows=repo.list('food_entries').filter(r=>r.data.day===day),total=totals(rows),targets=foodTargets(repo,day);
 const early=attributedDay()!==today();
 const chooseDay=(value:string)=>{setAiMode(null);setScanning(false);setDay(value);setCalendar(false);setEntry(null);setUndo(null);setStatus(null);};
 const run=(action:()=>void)=>{try{action();setStatus(null);}catch{setStatus(t('foodFailure'));}};
 const {colors,mode}=useTheme(),foodColor=tokens.color.pillar.food[mode];
 const [openEntry,setOpenEntry]=useState<string|null>(null),[mealMenu,setMealMenu]=useState<string|null>(null);
 const choose=(method:Method)=>{setFan(false);setAiMode(null);setScanning(false);if(method==='foodScan'){setScanning(true);setEntry(null);setLibrary(false);}else if(method==='foodSnap'||method==='foodDescribe'){setAiMode(method==='foodSnap'?'snap':'describe');setEntry(null);setLibrary(false);}else if(method==='foodManual'){setEntry({meal:selectedMeal});setLibrary(false);}else{setLibrary(!library);setEntry(null);}};
 const log=(food:Food)=>run(()=>{saveFood(repo,day,selectedMeal,food);setLibrary(false);});
 return <View style={{gap:tokens.spacing[3]}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:tokens.spacing[1]}}>
   <Round label={t('foodPrevious')} glyph="M15 5l-7 7 7 7" onPress={()=>chooseDay(shiftDay(day,-1))}/>
   <Pressable accessibilityRole="button" accessibilityLabel={t('foodCalendar')} accessibilityValue={{text:t('foodDay').replace('{day}',day)}} accessibilityState={{expanded:calendar}} onPress={()=>setCalendar(!calendar)} style={{flex:1,minHeight:touchTarget,alignItems:'center',justifyContent:'center'}}>
    <ThemedText variant="headline" style={{fontWeight:'600'}}>{dayTitle(day)}</ThemedText>
    <ThemedText muted variant="caption" accessibilityLabel={t('foodDay').replace('{day}',day)}>{dayDate(day)}</ThemedText>
   </Pressable>
   <Round label={t('foodNext')} glyph="M9 5l7 7-7 7" disabled={day>=today()} onPress={()=>chooseDay(shiftDay(day,1))}/>
  </View>
  {calendar&&<Card style={card}><FoodCalendar day={day} today={today()} onSelect={chooseDay}/></Card>}
  {early&&(day===attributedDay()||day===today())&&<Card style={card}><ThemedText>{t('foodEarly').replace('{day}',day)}</ThemedText><Button variant="secondary" label={t(day===today()?'foodUsePrevious':'foodUseToday')} onPress={()=>chooseDay(day===today()?attributedDay():today())}/></Card>}
  <Card style={[card,{alignItems:'center',paddingVertical:tokens.spacing[4]}]} testID="food-ring-card">
   <CalorieRing total={total} target={targets.targets} logged={rows.length>0} estimated={rows.some(row=>aiState(repo).entries[row.id]?.confirmed===false)}/>
   <ThemedText muted variant="caption">{t('foodBurned')}</ThemedText>
  </Card>
  <View style={{flexDirection:'row',gap:6}} testID="food-log-row">
   {METHODS.map(method=><Pressable key={method} accessibilityRole="button" accessibilityLabel={t(method)} onPress={()=>choose(method)}
    style={({pressed})=>({flex:1,minHeight:64,borderRadius:14,alignItems:'center',justifyContent:'center',gap:4,backgroundColor:colors.surface,opacity:pressed?0.7:1})}>
    <Svg width={22} height={22} viewBox="0 0 24 24" accessible={false}><Path d={METHOD_ICON[method]} fill="none" stroke={foodColor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/></Svg>
    <ThemedText variant="caption" numberOfLines={1}>{t(method)}</ThemedText>
   </Pressable>)}
  </View>
  <FoodAiMorningReview key={reviewClock} repo={repo}/>
  <FoodAiResults repo={repo} onDescribe={id=>{setScanning(false);setEntry(null);setLibrary(false);const job=aiState(repo).fallback.find(j=>j.id===id)!;setDay(job.day);setSelectedMeal(job.meal);setFallbackId(id);setAiMode('describe');}} onManual={id=>{setScanning(false);setLibrary(false);const job=aiState(repo).fallback.find(j=>j.id===id)!;setDay(job.day);setSelectedMeal(job.meal);setFallbackId(id);setAiMode(null);setEntry({meal:job.meal});}}/>
  <View style={{gap:tokens.spacing[0]}}>
   <View style={{flexDirection:'row',alignItems:'center'}}>
    <ThemedText muted variant="caption" style={{flex:1}}>{t('foodChooseMeal')}</ThemedText>
    <Round label={t('foodFan')} glyph={fan?'M5 12h14':'M12 5v14M5 12h14'} filled onPress={()=>setFan(!fan)}/>
   </View>
   <View style={{flexDirection:'row',flexWrap:'wrap',columnGap:6}}>{mealList.map(meal=><Pick key={meal.id} label={meal.name} selected={selectedMeal===meal.id} onPress={()=>{setSelectedMeal(meal.id);if(entry)setEntry({...entry,meal:meal.id});}}/>)}</View>
   {fan&&<View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{METHODS.map(method=><Button key={method} label={'+ '+t(method)} variant="secondary" onPress={()=>{if(method==='foodSaved'){setFan(false);setAiMode(null);setScanning(false);setLibrary(true);}else choose(method);}}/>)}</View>}
  </View>
  {status&&<ThemedText accessibilityLiveRegion="polite">{status}</ThemedText>}
  {undo&&<Card style={card}><ThemedText accessibilityLiveRegion="polite">{t('foodDeleted')}</ThemedText><Button label={t('foodUndo')} onPress={()=>run(()=>{if(!undoFood(repo,undo)){setUndo(null);throw new Error();}setUndo(null);})}/></Card>}
  {scanning&&<Card style={card}><FoodScanner repo={repo} onChoose={food=>{setEntry({meal:selectedMeal,initial:food});setScanning(false);}} onManual={()=>{setEntry({meal:selectedMeal});setScanning(false);}} onClose={()=>setScanning(false)}/></Card>}
  {aiMode&&<Card style={card}><FoodAiEntry key={aiMode+day+selectedMeal} repo={repo} fallbackId={fallbackId} mode={aiMode} day={day} meal={selectedMeal} onClose={()=>setAiMode(null)} onManual={()=>{setAiMode(null);setEntry({meal:selectedMeal});}}/></Card>}
  {entry&&<Card style={card}><FoodEntry key={entry.id??'new'} initial={entry.initial} day={day} onClose={()=>setEntry(null)} onSave={(food,multiple)=>{const row=saveFood(repo,day,entry.meal,food,multiple,entry.id);if(fallbackId!==undefined){attachFallback(repo,row.id,fallbackId);setFallbackId(undefined);}if(entry.id&&aiState(repo).entries[entry.id])confirmEstimate(repo,entry.id);setEntry(null);}}/></Card>}
  {library&&<Card style={card}>
   {([{title:'foodSaved',foods:repo.list('saved_foods').map((r):Food=>({...r.data,saved_food_id:r.id,amount_g:r.data.serving_g??null}))},{title:'foodRecent',foods:recentFoods(repo)},{title:'foodFavorites',foods:allFavorites(repo,selectedMeal)}] as const).map(section=><View key={section.title} style={{gap:6}}><ThemedText variant="headline">{t(section.title)}</ThemedText>{!section.foods.length&&<ThemedText muted>{t('foodNoSaved')}</ThemedText>}{section.foods.map((food,i)=><Button key={i} variant="secondary" label={t('foodLogSaved').replace('{name}',String(food['name']))} onPress={()=>log(food)}/>)}</View>)}
   <ThemedText variant="headline">{t('foodCombos')}</ThemedText>{combos(repo).map((item,i)=><Button key={i} variant="secondary" label={t('foodLogSaved').replace('{name}',item.name)} onPress={()=>run(()=>{logCombo(repo,item,day,selectedMeal);setLibrary(false);})}/>)}
  </Card>}
  {!rows.length&&<Card style={[card,{alignItems:'center',paddingVertical:tokens.spacing[4]}]} testID="food-empty">
   <ThemedText variant="headline" style={{fontWeight:'600'}}>{t('foodNothing')}</ThemedText>
   <ThemedText muted variant="caption" style={{textAlign:'center'}}>{t('foodNothingBody')}</ThemedText>
  </Card>}
  {mealList.map(meal=>{
   const items=rows.filter(row=>row.data.meal_id===meal.id),quick=favorites(repo,meal.id),menu=mealMenu===meal.id;
   // Items with no calories entered are left out of the sum; a meal with none entered shows a dash, never 0.
   const known=items.map(row=>kcal(row.data.energy_kj)).filter((n):n is number=>n!==null),sum=known.reduce((n,value)=>n+value,0);
   return <Card key={meal.id} style={[card,{gap:tokens.spacing[1]}]} testID={`food-meal-${meal.name}`}>
    <View style={{flexDirection:'row',alignItems:'center',gap:tokens.spacing[1]}}>
     <ThemedText variant="headline" style={{flex:1,fontWeight:'600'}}>{meal.name}</ThemedText>
     {!!items.length&&<ThemedText muted numeric variant="caption">{known.length?t('foodEnergy').replace('{value}',sum.toLocaleString('en-US')):t('foodEnergyUnknown')}</ThemedText>}
     <Pressable accessibilityRole="button" accessibilityLabel={t('foodMealOptions').replace('{name}',meal.name)} accessibilityState={{expanded:menu}} onPress={()=>setMealMenu(menu?null:meal.id)}
      style={{width:touchTarget,height:touchTarget,alignItems:'center',justifyContent:'center',marginVertical:-6,marginRight:-6}}>
      <View style={{width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:colors['surface-2']}}>
       <Svg width={18} height={18} viewBox="0 0 24 24" accessible={false}><Path d="M5 12h.5M11.75 12h.5M18.5 12h.5" fill="none" stroke={colors['text-muted']} strokeWidth={3} strokeLinecap="round"/></Svg>
      </View>
     </Pressable>
    </View>
    {menu&&<View style={{flexDirection:'row',flexWrap:'wrap',columnGap:6}}>
     <Act text={t('foodActRename')} label={t('foodRename').replace('{name}',meal.name)} onPress={()=>setRename({id:meal.id,name:meal.name})}/>
     <Act text={t('foodActCopy')} label={t('foodCopy').replace('{name}',meal.name)} onPress={()=>run(()=>copyYesterday(repo,day,meal.id))}/>
     <Act text={t('foodActCombo')} label={t('foodSaveCombo').replace('{name}',meal.name)} disabled={!items.length} onPress={()=>setCombo({meal:meal.id,name:meal.name})}/>
    </View>}
    {!!quick.length&&<View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{quick.map((food,i)=><Button key={i} label={t('foodLogSaved').replace('{name}',String(food.name))} variant="secondary" onPress={()=>run(()=>{saveFood(repo,day,meal.id,food);})}/>)}</View>}
    {items.map((row,index)=>{
     const name=String(row.data.name),energy=t('foodEnergy').replace('{value}',kcal(row.data.energy_kj)===null?'—':String(kcal(row.data.energy_kj)));
     const pending=aiState(repo).entries[row.id]?.confirmed===false,open=openEntry===row.id;
     const known=[row.data.protein_g,row.data.carbs_g,row.data.fat_g].some(v=>v!=null);
     return <View key={row.id} style={{borderTopWidth:index?1:0,borderTopColor:colors['surface-2'],gap:6}}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('foodEntryActions').replace('{name}',name).replace('{energy}',energy)} accessibilityState={{expanded:open}} onPress={()=>setOpenEntry(open?null:row.id)}
       style={{flexDirection:'row',alignItems:'center',gap:10,minHeight:52}}>
       <LocalMealThumbnail data={aiState(repo).entries[row.id]?.thumbnail}/>
       <View style={{flex:1}}>
        <ThemedText>{name}{pending&&<ThemedText muted variant="caption">{'  '}{t('foodEstimateChip')}</ThemedText>}</ThemedText>
        {known&&<ThemedText muted numeric variant="caption">P {gram(row.data.protein_g)} · C {gram(row.data.carbs_g)} · F {gram(row.data.fat_g)}</ThemedText>}
       </View>
       <ThemedText muted numeric>{energy}</ThemedText>
      </Pressable>
      {pending&&<View style={{borderWidth:1,borderStyle:'dashed',borderColor:colors['text-muted'],borderRadius:12,padding:8,gap:6}}><ThemedText variant="caption">{t('foodAiPending')}</ThemedText><Button label={t('foodAiConfirm').replace('{name}',name)} variant="secondary" onPress={()=>confirmEstimate(repo,row.id)}/></View>}
      {open&&<View style={{flexDirection:'row',flexWrap:'wrap',columnGap:6,paddingBottom:tokens.spacing[0]}}>
       <Act text={t('edit')} label={t('foodEdit').replace('{name}',name)} onPress={()=>{setAiMode(null);setScanning(false);setSelectedMeal(meal.id);setEntry({id:row.id,initial:row.data,meal:meal.id});}}/>
       <Act text={t(allFavorites(repo,meal.id).some(f=>f.name===row.data.name)?'foodActUnfavorite':'foodActFavorite')} label={t(allFavorites(repo,meal.id).some(f=>f.name===row.data.name)?'foodUnfavorite':'foodFavorite').replace('{name}',name)} onPress={()=>run(()=>toggleFavorite(repo,meal.id,row.data))}/>
       <Act text={t('foodActKeep')} label={t('foodKeep').replace('{name}',name)} onPress={()=>run(()=>{saveReusable(repo,row.data);})}/>
       <Act danger text={t('delete')} label={t('foodDelete').replace('{name}',name)} onPress={()=>run(()=>{setOpenEntry(null);setUndo(deleteFood(repo,row.id));})}/>
      </View>}
     </View>;
    })}
    {!items.length&&<ThemedText muted variant="caption">{t('foodEmptyMeal')}</ThemedText>}
   </Card>;
  })}
  <Button label={t('foodAddMeal')} variant="secondary" onPress={()=>setRename({name:''})}/>
  {rename&&<Card style={card}><Field label={t('foodMealName')} value={rename.name} onChange={name=>setRename({...rename,name})}/><Button label={t('foodSaveMeal')} onPress={()=>run(()=>{saveMeal(repo,rename.name,rename.id);setRename(null);})}/><Button label={t('cancel')} variant="secondary" onPress={()=>setRename(null)}/></Card>}
  {combo&&<Card style={card}><Field label={t('foodComboName')} value={combo.name} onChange={name=>setCombo({...combo,name})}/><Button label={t('foodComboSave')} onPress={()=>run(()=>{saveCombo(repo,day,combo.meal,combo.name);setCombo(null);})}/><Button label={t('cancel')} variant="secondary" onPress={()=>setCombo(null)}/></Card>}
  <Card style={card}><FoodTargets key={day} repo={repo} day={day} revision={revision}/></Card>
  <Card style={[card,{gap:tokens.spacing[1]}]}>
   <ThemedText variant="headline" style={{fontWeight:'600'}}>{t('foodTotals')}</ThemedText>
   {(['fiber_g','sugar_g','sodium_mg'] as const).map((key,i)=><View key={key} style={{flexDirection:'row'}}><ThemedText style={{flex:1}}>{t((['foodFiber','foodSugar','foodSodium'] as const)[i])}</ThemedText><ThemedText numeric muted={total[key]===null}>{total[key]===null?'—':String(Math.round(total[key]! *10)/10)}</ThemedText></View>)}
   <ThemedText muted variant="caption">{t('foodUnknown')}</ThemedText>
  </Card>
 </View>;
}
