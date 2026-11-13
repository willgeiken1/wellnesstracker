import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Panel } from '@/components/card';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { localDay, displayWeight, fromKg } from '@/core/workout/rules';
import type { Row } from '@/data/rows';
import type { WorkoutStore } from '@/data/workout/store';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { pluralize, t } from '@/i18n/en';
import { Field, PageBar, Primary, Round, Secondary, SectionTitle, Trouble, card, dayLabel, leave, minutesLabel, semibold, sessionPrint, whole } from './parts';
import { useWorkout } from './use-workout';

export function validPastDay(day: string) {
  const date = new Date(`${day}T12:00:00`);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(date.getTime()) && localDay(date) === day && day < localDay(new Date());
}
/** The calendar day a number of days away, using calendar arithmetic across DST. */
function shiftDay(day: string, by: number) {
  const date = new Date(`${day}T12:00:00`);
  return localDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() + by));
}
/** "Today", "Yesterday", or a short date. */
function dayTitle(day: string) {
  const today = localDay(new Date());
  return day === today ? t('today') : day === shiftDay(today, -1) ? t('yesterday') : dayLabel(day);
}
/** Seven calendar days, using calendar arithmetic across DST. On its own it ends today and opens the day's screen.
 * Given a selected day it keeps that day in view, marks it, and never offers a day after today. */
export function WeekStrip({ selected, onSelect, store }: { selected?: string; onSelect?: (day: string) => void; store?: WorkoutStore }) {
  const today = new Date(), todayKey = localDay(today);
  const ahead = selected ? shiftDay(selected, 3) : todayKey;
  const end = new Date(`${ahead < todayKey ? ahead : todayKey}T12:00:00`);
  const days = Array.from({length:7}, (_, i) => {
    const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6 + i);
    return localDay(date);
  });
  const trained = new Set(store?.history().map(s => String(s.data.day)));
  const {colors} = useTheme();
  return <View accessibilityLabel={t('workoutWeek')} style={{flexDirection:'row',alignItems:'stretch',flexWrap:'wrap',gap:4}}>
    {days.map(day => {
      const on = day === selected;
      return <Pressable key={day} accessibilityRole="button" accessibilityLabel={t('viewDayWorkouts').replace('{day}',day)}
        accessibilityState={selected ? {selected:on} : undefined} accessibilityValue={trained.has(day) ? {text:t('dayHasWorkout')} : undefined}
        style={({pressed}) => ({flex:1,minWidth:44,minHeight:56,paddingVertical:6,gap:2,borderRadius:12,backgroundColor:on ? colors.accent : colors.surface,alignItems:'center',justifyContent:'center',opacity:pressed ? 0.7 : 1})}
        onPress={() => onSelect ? onSelect(day) : router.push({pathname:'/workout/day',params:{day}})}>
        <ThemedText variant="caption" style={{color:on ? colors['on-accent'] : colors['text-muted']}}>{new Date(`${day}T12:00:00`).toLocaleDateString('en-US',{weekday:'short'})}</ThemedText>
        <ThemedText numeric style={[semibold,{color:on ? colors['on-accent'] : colors.text}]}>{Number(day.slice(-2))}</ThemedText>
        <View testID={trained.has(day) ? `week-dot-${day}` : undefined} style={{width:6,height:6,borderRadius:3,backgroundColor:trained.has(day) ? (on ? colors['on-accent'] : colors.training) : 'transparent'}} />
      </Pressable>;
    })}
  </View>;
}
/** Workouts > History: choose a day that has passed, then open it to see or log that day's workout. */
export function PastDayChoice() {
  const yesterday = shiftDay(localDay(new Date()), -1);
  const [day,setDay] = useState(yesterday);
  const [error,setError] = useState(false);
  const base = validPastDay(day) ? day : yesterday;
  const move = (by: number) => { setDay(shiftDay(base, by)); setError(false); };
  return <Panel testID="past-day-choice" style={[card,{gap:tokens.spacing[2]}]}>
    <ThemedText variant="headline" accessibilityRole="header" style={semibold}>{t('logPastWorkout')}</ThemedText>
    <View style={{flexDirection:'row',alignItems:'center',gap:tokens.spacing[1]}}>
      <Round onSurface glyph="back" label={t('dayPrevious')} onPress={() => move(-1)} />
      <View style={{flex:1,alignItems:'center'}}>
        <ThemedText style={[semibold,{textAlign:'center'}]}>{validPastDay(day) ? dayTitle(day) : t('dayPickPast')}</ThemedText>
      </View>
      <Round onSurface glyph="forward" label={t('dayNext')} disabled={base >= yesterday} onPress={() => move(1)} />
    </View>
    <Field label={t('workoutDay')} value={day} onChangeText={text => { setDay(text); setError(false); }} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" />
    {error && <Trouble text={t('invalidWorkoutDay')} />}
    <Secondary onSurface label={t('openWorkoutDay')} onPress={() => {
      if (!validPastDay(day)) {setError(true); return;}
      router.push({pathname:'/workout/day',params:{day}});
    }} />
  </Panel>;
}
/** One finished workout on the day screen: its facts, then each exercise with its sets. The top row opens the summary. */
function SessionCard({store,session}: {store:WorkoutStore;session:Row}) {
  const {colors} = useTheme();
  const name = String(session.data.name ?? t('workoutName')), entries = store.entries(session.id).filter(e => !store.skipped(e.id));
  const count = entries.reduce((n, e) => n + store.sets(e.id).length, 0), unit = store.unit();
  const volume = fromKg(sessionPrint(store, session.id).totalKg, unit);
  const facts = [minutesLabel(Number(session.data.duration_ms)), count ? pluralize(count, 'set') : '', volume > 0 ? `${whole(volume)} ${unit}` : ''].filter(Boolean).join(' · ');
  return <Panel testID={`day-session-${session.id}`} style={[card,{gap:0,paddingVertical:tokens.spacing[1]}]}>
    <Pressable accessibilityRole="button" accessibilityLabel={t('dayOpenSummary').replace('{name}',name)} accessibilityValue={facts ? {text:facts} : undefined}
      onPress={() => router.push({pathname:'/workout/summary',params:{id:session.id}})}
      style={({pressed}) => ({flexDirection:'row',alignItems:'center',gap:tokens.spacing[1],minHeight:56,opacity:pressed ? 0.7 : 1})}>
      <View style={{flex:1,gap:2}}>
        <ThemedText variant="headline" style={semibold}>{name}</ThemedText>
        {!!facts && <ThemedText muted numeric variant="caption">{facts}</ThemedText>}
      </View>
      {store.edited(session.id) && <View style={{borderRadius:99,paddingHorizontal:10,paddingVertical:3,backgroundColor:colors['surface-2']}}>
        <ThemedText muted variant="caption" accessibilityLabel={t('editedWorkout')}>{t('edited')}</ThemedText>
      </View>}
      <Icon name="chevron" size={18} color={colors['text-muted']} />
    </Pressable>
    {entries.length === 0 && <ThemedText muted style={{paddingVertical:tokens.spacing[1]}}>{t('summaryNoExercises')}</ThemedText>}
    {entries.map(e => {
      const sets = store.sets(e.id), entryUnit = store.unit(e.id);
      return <View key={e.id} style={{paddingVertical:tokens.spacing[1],gap:2,borderTopWidth:1,borderTopColor:colors['surface-2']}}>
        <ThemedText>{String(e.data.exercise)}</ThemedText>
        <ThemedText muted numeric variant="caption">{sets.length
          ? `${sets.map(set => `${displayWeight(Number(set.data.weight_kg),entryUnit)} × ${set.data.reps}`).join(', ')} · ${entryUnit}`
          : t('summaryNoSets')}</ThemedText>
      </View>;
    })}
  </Panel>;
}
/** One day of workouts. The bar steps a day at a time, the strip jumps within the week, and a short list jumps
 * to other days that have a workout. A day with nothing says so. */
export function DaySummary({store,day,onDay,note}: {store:WorkoutStore;day:string;onDay?:(day:string)=>void;note?:string}) {
  const {colors} = useTheme();
  const today = localDay(new Date()), history = store.history();
  const sessions = history.filter(s => s.data.day === day);
  const go = (next: string) => onDay ? onDay(next) : router.replace({pathname:'/workout/day',params:{day:next}});
  const others = [...new Set(history.map(s => String(s.data.day)))].filter(other => other !== day && (validPastDay(other) || other === today)).slice(0, 5);
  return <Screen topInset>
    <PageBar testID="day-bar" title={dayTitle(day)} left={<Round glyph="back" label={t('flowBack')} onPress={leave} />}
      right={<><Round testID="day-previous" glyph="back" label={t('dayPrevious')} onPress={() => go(shiftDay(day,-1))} />
        <Round testID="day-next" glyph="forward" label={t('dayNext')} disabled={day >= today} onPress={() => go(shiftDay(day,1))} /></>} />
    {dayTitle(day) !== dayLabel(day) && <ThemedText muted style={{marginTop:-tokens.spacing[1]}}>{dayLabel(day)}</ThemedText>}
    {!!note && <Trouble testID="day-note" text={note} />}
    <WeekStrip selected={day} onSelect={go} store={store} />
    {sessions.length === 0 && <Panel testID="day-empty" style={card}>
      <ThemedText style={semibold}>{t('noDayWorkouts')}</ThemedText>
      <ThemedText muted>{t(day === today ? 'dayEmptyToday' : 'dayEmptyPast')}</ThemedText>
    </Panel>}
    {sessions.map(s => <SessionCard key={s.id} store={store} session={s} />)}
    {validPastDay(day) && <Primary label={t('logDayWorkout')} onPress={() => router.push({pathname:'/workout',params:{day}})} />}
    {day === today && <Secondary label={t('flowWorkouts')} onPress={() => router.replace('/workouts')} />}
    {others.length > 0 && <>
      <SectionTitle>{t('dayOthers')}</SectionTitle>
      <Panel testID="day-others" style={[card,{gap:0,paddingVertical:tokens.spacing[0]}]}>
        {others.map((other, index) => {
          const count = history.filter(s => s.data.day === other).length;
          return <Pressable key={other} accessibilityRole="button" accessibilityLabel={t('viewDayWorkouts').replace('{day}',dayLabel(other))}
            onPress={() => go(other)}
            style={({pressed}) => ({minHeight:52,flexDirection:'row',alignItems:'center',gap:tokens.spacing[1],borderTopWidth:index ? 1 : 0,borderTopColor:colors['surface-2'],opacity:pressed ? 0.7 : 1})}>
            <ThemedText style={{flex:1}}>{dayLabel(other)}</ThemedText>
            <ThemedText muted numeric variant="caption">{count === 1 ? t('dayOneWorkout') : t('dayManyWorkouts').replace('{count}',String(count))}</ThemedText>
            <Icon name="chevron" size={18} color={colors['text-muted']} />
          </Pressable>;
        })}
      </Panel>
    </>}
  </Screen>;
}
/** /workout/day. A link with no date opens today; a date that cannot be read opens today and says so. */
export function WorkoutDay() {
  const {store} = useWorkout();
  const {day: param} = useLocalSearchParams<{day?:string}>();
  const today = localDay(new Date());
  const usable = (value: unknown): value is string => typeof value === 'string' && (validPastDay(value) || value === today);
  // A day chosen on this screen holds until the link itself changes.
  const [chosen,setChosen] = useState<{from:unknown;day:string} | null>(null);
  const picked = chosen && chosen.from === param ? chosen.day : null;
  const day = picked ?? (usable(param) ? param : today);
  if (!store) return <Screen topInset>
    <PageBar title={t('workouts')} left={<Round glyph="back" label={t('flowBack')} onPress={leave} />} />
    <Trouble text={t('localError')} />
  </Screen>;
  return <DaySummary store={store} day={day} onDay={next => setChosen({from:param,day:next})}
    note={!picked && param !== undefined && !usable(param) ? t('dayNotFound') : undefined} />;
}
