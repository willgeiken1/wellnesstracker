import { View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import type { ExerciseOptions } from '@/data/workout/options';
import { Field, Pick, semibold } from './parts';
export function RepRangeInput({exercise,value,onChange}: {exercise:string;value:ExerciseOptions;onChange:(options:ExerciseOptions)=>void}) {
  return <View style={{gap:tokens.spacing[0]}}>
    <ThemedText muted variant="caption" style={semibold}>{t('optionalRepRange')}</ThemedText>
    <View style={{flexDirection:'row',alignItems:'flex-start',gap:tokens.spacing[2]}}>{(['rep_min','rep_max'] as const).map(field =>
      <Field key={field} style={{flex:1}} label={t(field === 'rep_min' ? 'repMin' : 'repMax')} accessibilityLabel={`${exercise}, ${t(field === 'rep_min' ? 'repMin' : 'repMax')}`} keyboardType="number-pad" value={value[field] == null || Number.isNaN(value[field]) ? '' : String(value[field])} onChangeText={text => onChange({...value,[field]:text === '' ? null : /^\d+$/.test(text) ? Number(text) : NaN})} />)}</View>
    {(value.rep_min != null || value.rep_max != null) && <View style={{alignSelf:'flex-start'}}><Pick onSurface text={t('repRangeClear')} label={t('clearRepRange').replace('{name}',exercise)} onPress={() => onChange({...value,rep_min:null,rep_max:null})} /></View>}
  </View>;
}
