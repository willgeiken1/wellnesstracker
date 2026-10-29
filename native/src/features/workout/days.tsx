import { WorkoutUnavailable } from './view-state';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { localDay, displayWeight } from '@/core/workout/rules';
import type { WorkoutStore } from '@/data/workout/store';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
import { layout, WorkoutPanel as Panel } from './primitives';
import { useWorkout } from './use-workout';

export function validPastDay(day: string) {
  const date = new Date(`${day}T12:00:00`);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(date.getTime()) && localDay(date) === day && day < localDay(new Date());
}
/** Seven calendar days through today, using calendar arithmetic across DST. */
export function WeekStrip() {
  const today = new Date();
  const days = Array.from({length:7}, (_, i) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6 + i);
    return localDay(date);
  });
  const {colors} = useTheme();
  return <View accessibilityLabel={t('workoutWeek')} style={[layout.row,{flexWrap:'wrap',gap:4}]}>
    {days.map(day => <Pressable key={day} accessibilityRole="button" accessibilityLabel={t('viewDayWorkouts').replace('{day}',day)}
      style={{flex:1,minWidth:44,minHeight:48,borderRadius:8,backgroundColor:colors['surface-2'],alignItems:'center',justifyContent:'center'}}
      onPress={() => router.push({pathname:'/workout/day',params:{day}})}><ThemedText variant="caption">{new Date(`${day}T12:00:00`).toLocaleDateString('en-US',{weekday:'short'})}</ThemedText><ThemedText numeric>{Number(day.slice(-2))}</ThemedText></Pressable>)}
  </View>;
}
export function PastDayChoice() {
  const {colors} = useTheme();
  const [day,setDay] = useState(() => { const date = new Date(); date.setDate(date.getDate()-1); return localDay(date); });
  const [error,setError] = useState(false);
  return <View style={layout.stack}>
    <ThemedText>{t('logPastWorkout')}</ThemedText>
    <TextInput accessibilityLabel={t('workoutDay')} value={day} onChangeText={setDay} autoCapitalize="none"
      style={[layout.input,{color:colors.text,backgroundColor:colors['surface-2']}]} />
    {error && <ThemedText accessibilityRole="alert">{t('invalidWorkoutDay')}</ThemedText>}
    <Button label={t('openWorkoutDay')} variant="secondary" onPress={() => {
      if (!validPastDay(day)) {setError(true); return;}
      router.push({pathname:'/workout/day',params:{day}});
    }} />
  </View>;
}
export function DaySummary({store,day}: {store:WorkoutStore;day:string}) {
  const sessions = store.history().filter(s => s.data.day === day);
  return <Screen title={t('dayWorkouts').replace('{day}',day)} topInset>
    {sessions.length === 0 && <ThemedText muted>{t('noDayWorkouts')}</ThemedText>}
    {sessions.map(s => <Panel key={s.id}>
      <Button label={`${String(s.data.name ?? t('workoutName'))} · ${day}`} variant="secondary"
        onPress={() => router.push({pathname:'/workout/summary',params:{id:s.id}})} />
      {store.edited(s.id) && <ThemedText muted accessibilityLabel={t('editedWorkout')}>{t('edited')}</ThemedText>}
      {store.entries(s.id).map(e => <ThemedText key={e.id}>{String(e.data.exercise)} · {store.sets(e.id).map(set => `${displayWeight(Number(set.data.weight_kg),store.unit(e.id))} × ${set.data.reps}`).join(', ')}</ThemedText>)}
    </Panel>)}
    {validPastDay(day) && <Button label={t('logDayWorkout')} onPress={() => router.push({pathname:'/workout',params:{day}})} />}
    <Button label={t('backHome')} variant="secondary" onPress={() => router.replace('/')} />
  </Screen>;
}
export function WorkoutDay() {
  const {store,auth} = useWorkout();
  const {day} = useLocalSearchParams<{day:string}>();
  if (!store) return <Screen topInset><WorkoutUnavailable auth={auth}/></Screen>;
  return day && (validPastDay(day) || day === localDay(new Date())) ? <DaySummary store={store} day={day}/> :
    <Screen topInset><ThemedText>{t('invalidWorkoutDay')}</ThemedText></Screen>;
}
