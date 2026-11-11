import { View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ChoiceChips, restClock, semibold } from '@/features/settings/parts';
import { t } from '@/i18n/en';
import { layout } from './primitives';
export interface ExerciseRest { seconds: number; style: 'unwind' | 'converge' }
/** Rest lengths read as a clock (1:30) and are spoken in seconds. */
export const restChoices = (seconds: readonly number[]) => seconds.map(value => ({ value, label: restClock(value), accessibilityLabel: `${value} ${t('seconds')}` }));
export const REST_STYLES = ['unwind', 'converge'] as const;
export function RestOptions({value, onChange}: {value: ExerciseRest; onChange: (value: ExerciseRest) => void}) {
  return <View style={layout.stack}>
    <ThemedText style={semibold}>{t('exerciseRest')}</ThemedText>
    <ChoiceChips options={restChoices([30, 60, 90, 120, 180])} value={value.seconds} onChange={seconds => onChange({...value, seconds})} />
    <ThemedText style={semibold}>{t('restStyle')}</ThemedText>
    <ChoiceChips options={REST_STYLES.map(style => ({ value: style, label: t(style) }))} value={value.style} onChange={style => onChange({...value, style})} />
  </View>;
}
