import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
import { WorkoutPanel as Panel } from './primitives';
/** Local repositories are synchronous once ready; delay only the initial-load placeholder. */
export function WorkoutLoading() {
 const [visible,setVisible]=useState(false);
 const {colors}=useTheme();
 useEffect(() => {const timer=setTimeout(() => setVisible(true),300); return () => clearTimeout(timer);},[]);
 return visible ? <View testID="workout-loading" accessibilityLabel={t('loadingWorkouts')} accessibilityState={{busy:true}} style={{gap:16}}>
  {[0,1].map(i => <Panel key={i}><View style={{height:44,backgroundColor:colors.surface}}/></Panel>)}
 </View> : null;
}
export function WorkoutError({onRetry, message=t('workoutChangeSaveError')}: {onRetry?: () => void; message?:string}) {
 return <View style={{gap:8}}><ThemedText muted selectable accessibilityRole="alert">{message}</ThemedText>{onRetry && <Button label={t('tryAgain')} variant="secondary" onPress={onRetry}/>}</View>;
}

export function WorkoutUnavailable({auth}: {auth?: ReturnType<typeof import('./use-workout').useWorkout>['auth']}) {
 if (auth?.ready === false && !auth.recovery) return <WorkoutLoading/>;
 return <WorkoutError message={t('workoutsUnavailable')} onRetry={() => {
  if (auth?.recovery === 'read-error' || auth?.recovery === 'unreadable-marker') auth.retryMarkerRead?.();
  else auth?.retryBoot?.();
 }}/>;
}
