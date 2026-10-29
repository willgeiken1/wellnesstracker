import { useEffect, useMemo, useState } from 'react';
import { AppState, View } from 'react-native';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/screen';
import { useWorkout } from '@/features/workout/use-workout';
import { BodyAtlas } from '@/features/atlas/body-atlas';
import { atlasSessions } from '@/features/atlas/read-logs';
import { ExampleTag, Label, LoadingPanels, LoadError, PatternPanel, ReadBoundary, Sparkline, TonePanel } from '@/features/body/presentation';
import { useTheme } from '@/design/theme-provider';
import { weekOf } from '@/core/workout/rules';
import { today } from '@/features/onboarding/model';
import { shiftDay, totals } from '@/features/food/model';
import type { WorkoutStore } from '@/data/workout/store';

const sections = [
 { value: 'trends', label: 'Trends' }, { value: 'recovery', label: 'Recovery' },
 { value: 'muscles', label: 'Muscles' }, { value: 'weekly', label: 'Weekly' },
];
export default function Page() {
 const {store, auth}=useWorkout();
 const [now,setNow]=useState(Date.now);
 const [section,setSection]=useState('trends');
 useEffect(()=>{
  const timer=setInterval(()=>setNow(Date.now()),60000);
  const sub=AppState.addEventListener('change',state=>{if(state==='active') setNow(Date.now());});
  return ()=>{clearInterval(timer);sub.remove();};
 },[]);
 return <Screen title="Insights" tabHeader>
  {auth.demo && <ExampleTag />}
  {auth.syncStatus === 'offline' && <ThemedText muted variant="caption">Offline · logs save here and sync when you reconnect.</ThemedText>}
  <SegmentedControl label="Insights sections" options={sections} value={section} onChange={setSection}/>
  {auth.recovery ? <LoadError name="insights" onRetry={() => auth.retryBoot?.()} /> : auth.ready === false || !store ? <LoadingPanels /> :
   <ReadBoundary key={`${store.repo.owner}:${section}`} name="insights">
    {section === 'muscles' ? <Muscles store={store} now={now} /> : section === 'recovery' ? <Recovery /> : <Reports store={store} section={section} />}
   </ReadBoundary>}
 </Screen>;
}
function Muscles({store, now}: { store: WorkoutStore; now: number }) {
 // useWorkout returns a new facade on repository revisions, including history edits.
 const sessions=useMemo(()=>atlasSessions(store),[store]);
 return <BodyAtlas sessions={sessions} now={now} haptics={store?.repo.localGet<boolean>('haptics')!==false}/>;
}
function RecoveryTile({ label }: { label: string }) {
 return <View style={{ flexBasis: '30%', flexGrow: 1 }}><TonePanel><Label>{label}</Label><ThemedText muted>No data from Health yet</ThemedText></TonePanel></View>;
}
function Recovery() {
 // No HealthKit/Health Connect hook exists in this shell. Keep unavailable values gray.
 return <View style={{ gap: 16 }}>
  <TonePanel><Label>Last night</Label><ThemedText muted>No data from Health yet</ThemedText></TonePanel>
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{['HRV', 'Sleep', 'Steps'].map(label => <RecoveryTile key={label} label={label} />)}</View>
  <ThemedText muted variant="caption">30-day history appears when recovery data is available.</ThemedText>
 </View>;
}
function Reports({ store, section }: { store: WorkoutStore; section: string }) {
 const { colors } = useTheme();
 const history = store.history();
 const food = store.repo.list('food_entries');
 const daysLogged = new Set([...history.map(row => String(row.data.day)), ...food.map(row => String(row.data.day))].filter(day => day <= today()));
 if (section === 'weekly') {
  const weeks = [...new Set(history.map(row => weekOf(new Date(`${row.data.day}T12:00:00`))))].sort().reverse();
  return weeks.length ? <View style={{ gap: 24 }}>{weeks.map(week => {
   const sessions = history.filter(row => weekOf(new Date(`${row.data.day}T12:00:00`)) === week);
   const days = Array.from({ length: 7 }, (_, i) => shiftDay(week, i));
   const volume = days.map(day => sessions.filter(row => row.data.day === day).reduce((sum, row) => sum + store.summary(row.id).volume, 0));
   return <View key={week} style={{ gap: 8 }}><Label>Week of {week}</Label><TonePanel><ThemedText numeric>{sessions.length} workouts</ThemedText><Sparkline testID="weekly-chart" values={volume} label={`Training volume for week of ${week}, ${store.unit()} repetitions: ${volume.join(', ')}`} /><ThemedText muted variant="caption">Training volume · {store.unit()} × reps</ThemedText></TonePanel></View>;
  })}</View> : <TonePanel><Label>No weekly reports yet</Label><ThemedText muted>Your finished workouts appear here by week.</ThemedText></TonePanel>;
 }
 if (daysLogged.size < 7) return <TonePanel><ThemedText>Trends need a few days. Log for a week and patterns show up here.</ThemedText></TonePanel>;
 const days = Array.from({ length: 14 }, (_, i) => shiftDay(today(), i - 13));
 const calories = days.map(day => {
  const kj = totals(food.filter(row => row.data.day === day)).energy_kj;
  return kj === null ? null : Math.round(kj / 4.184);
 });
 const volumes = days.map(day => history.filter(row => row.data.day === day).reduce((sum, row) => sum + store.summary(row.id).volume, 0));
 return <View style={{ gap: 24 }}>
  <View testID="pattern-panels" style={{ gap: 8 }}><Label>What affects you</Label><PatternPanel /></View>
  <View testID="fourteen-day-charts" style={{ gap: 16 }}>
   <TonePanel><Label>Calories · 14 days</Label>{calories.some(value => value !== null) ? <Sparkline values={calories} label={`Logged daily calories: ${days.map((day, i) => `${day}: ${calories[i] ?? 'not logged'}`).join(', ')}`} color={colors['accent-2']} /> : <ThemedText muted>No food logged in the last 14 days</ThemedText>}<ThemedText muted variant="caption">{days[0]} – {days[13]} · logged days only</ThemedText></TonePanel>
   <TonePanel><Label>Training volume · 14 days</Label><Sparkline values={volumes} label={`Daily training volume, ${store.unit()} repetitions: ${volumes.join(', ')}`} /><ThemedText muted variant="caption">{days[0]} – {days[13]} · {store.unit()} × reps</ThemedText></TonePanel>
  </View>
 </View>;
}
