import { View } from 'react-native';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { t } from '@/i18n/en';
import { layout } from './primitives';
export interface ExerciseRest { seconds: number; style: 'unwind' | 'converge' }
export function RestOptions({value, onChange}: {value: ExerciseRest; onChange: (value: ExerciseRest) => void}) {
  return <View style={layout.stack}>
    <ThemedText>{t('exerciseRest')}</ThemedText>
    <View style={[layout.row, {flexWrap:'wrap'}]}>{[30,60,90,120,180].map(seconds => <Button key={seconds} label={`${seconds} ${t('seconds')}`} selected={value.seconds === seconds} variant="secondary" onPress={() => onChange({...value, seconds})} />)}</View>
    <ThemedText>{t('restStyle')}</ThemedText>
    <View style={layout.row}>{(['unwind','converge'] as const).map(style => <Button key={style} label={t(style)} selected={value.style === style} variant="secondary" onPress={() => onChange({...value, style})} />)}</View>
  </View>;
}
