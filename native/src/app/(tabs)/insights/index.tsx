import { useEffect, useMemo, useState } from 'react';
import { AppState, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/button';
import { t } from '@/i18n/en';
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
 { value: 'trends', label: t('trends') }, { value: 'recovery', label: t('recovery') },
 { value: 'muscles', label: t('insightsMuscles') }, { value: 'weekly', label: t('insightsWeekly') },
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
 return <Screen title={t('insights')} tabHeader>
  {auth.demo && <ExampleTag />}
  {auth.syncStatus === 'offline' && <ThemedText muted variant="caption">{t('localOffline')}</ThemedText>}
  <SegmentedControl label={t('insightsSections')} options={sections} value={section} onChange={setSection}/>
  {auth.recovery ? <LoadError name="insights" onRetry={() => auth.retryBoot?.()} /> : auth.ready === false || !store ? <LoadingPanels /> :
   <ReadBoundary key={`${store.repo.owner}:${section}`} name="insights">
    {section === 'muscles' ? <Muscles store={store} now={now} /> : section === 'recovery' ? <Recovery /> : <Reports store={store} section={section} />}
   </ReadBoundary>}
  <Button label={t('backHome')} variant="secondary" onPress={() => router.navigate('/')} />
 </Screen>;
}
function Muscles({store, now}: { store: WorkoutStore; now: number }) {
 // useWorkout returns a new facade on repository revisions, including history edits.
 const sessions=useMemo(()=>atlasSessions(store),[store]);
 return <BodyAtlas sessions={sessions} now={now} haptics={store?.repo.localGet<boolean>('haptics')!==false}/>;
}
function RecoveryTile({ label }: { label: string }) {
 return <View style={{ flexBasis: '30%', flexGrow: 1 }}><TonePanel><Label>{label}</Label><ThemedText muted>{t('insightsHealthEmpty')}</ThemedText></TonePanel></View>;
}
function Recovery() {
 // No HealthKit/Health Connect hook exists in this shell. Keep unavailable values gray.
 return <View style={{ gap: 16 }}>
  <TonePanel><Label>{t('insightsLastNight')}</Label><ThemedText muted>{t('insightsHealthEmpty')}</ThemedText></TonePanel>
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[t('insightsHrv'), t('insightsSleep'), t('insightsSteps')].map(label => <RecoveryTile key={label} label={label} />)}</View>
  <ThemedText muted variant="caption">{t('insightsRecoveryHistory')}</ThemedText>
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
   return <View key={week} style={{ gap: 8 }}><Label>{t('insightsWeekOf').replace('{week}', week)}</Label><TonePanel><ThemedText numeric>{t('insightsWorkoutCount').replace('{count}', String(sessions.length))}</ThemedText><Sparkline testID="weekly-chart" values={volume} label={chartSummary(t('insightsWeeklyVolume').replace('{week}', week), days, volume, t('insightsVolumeUnits').replace('{unit}', store.unit()))} /><ThemedText muted variant="caption">{t('insightsVolumeUnit').replace('{unit}', store.unit())}</ThemedText></TonePanel></View>;
  })}</View> : <TonePanel><Label>{t('insightsWeeklyEmpty')}</Label><ThemedText muted>{t('insightsWeeklyHint')}</ThemedText></TonePanel>;
 }
 if (daysLogged.size < 7) return <TonePanel><ThemedText>{t('insightsTrendsEmpty')}</ThemedText></TonePanel>;
 const days = Array.from({ length: 14 }, (_, i) => shiftDay(today(), i - 13));
 const calories = days.map(day => {
  const kj = totals(food.filter(row => row.data.day === day)).energy_kj;
  return kj === null ? null : Math.round(kj / 4.184);
 });
 const volumes = days.map(day => history.filter(row => row.data.day === day).reduce((sum, row) => sum + store.summary(row.id).volume, 0));
 return <View style={{ gap: 24 }}>
  <View testID="pattern-panels" style={{ gap: 8 }}><Label>{t('insightsPatterns')}</Label><PatternPanel /></View>
  <View testID="fourteen-day-charts" style={{ gap: 16 }}>
   <TonePanel><Label>{t('insightsCalories')}</Label>{calories.some(value => value !== null) ? <Sparkline values={calories} label={chartSummary(t('insightsDailyCalories'), days, calories, 'kcal')} color={colors['accent-2']} /> : <ThemedText muted>{t('insightsFoodEmpty')}</ThemedText>}<ThemedText muted variant="caption">{t('insightsLoggedRange').replace('{start}', days[0]).replace('{end}', days[13])}</ThemedText></TonePanel>
   <TonePanel><Label>{t('insightsVolume')}</Label><Sparkline values={volumes} label={chartSummary(t('insightsDailyVolume'), days, volumes, t('insightsVolumeUnits').replace('{unit}', store.unit()))} /><ThemedText muted variant="caption">{t('insightsVolumeRange').replace('{start}', days[0]).replace('{end}', days[13]).replace('{unit}', store.unit())}</ThemedText></TonePanel>
  </View>
 </View>;
}

function chartSummary(name: string, days: string[], values: (number | null)[], unit: string) {
 const logged = values.flatMap((value, index) => value === null ? [] : [{ value, day: days[index] }]);
 const latest = logged.at(-1)!;
 return t('insightsChartSummary').replace('{name}', name).replace('{start}', days[0]).replace('{end}', days.at(-1)!)
  .replace('{average}', String(Math.round(logged.reduce((sum, point) => sum + point.value, 0) / logged.length)))
  .replaceAll('{unit}', unit).replace('{logged}', values.includes(null) ? t('insightsOnLoggedDays') : '')
  .replace('{latest}', String(latest.value)).replace('{day}', latest.day);
}
