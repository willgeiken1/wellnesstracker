import { View, TextInput } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/button';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
import type { ExerciseOptions } from '@/data/workout/options';
import { layout } from './primitives';
export function RepRangeInput({exercise,value,onChange}: {exercise:string;value:ExerciseOptions;onChange:(options:ExerciseOptions)=>void}) {
  const {colors} = useTheme();
  return <View>
    <ThemedText>{t('optionalRepRange')}</ThemedText>
    <View style={layout.row}>{(['rep_min','rep_max'] as const).map(field => <View key={field} style={{flex:1}}>
      <ThemedText>{t(field === 'rep_min' ? 'repMin' : 'repMax')}</ThemedText>
      <TextInput accessibilityLabel={`${exercise}, ${t(field === 'rep_min' ? 'repMin' : 'repMax')}`} keyboardType="number-pad" style={[layout.input,{color:colors.text,backgroundColor:colors['surface-2']}]} value={value[field] == null || Number.isNaN(value[field]) ? '' : String(value[field])} onChangeText={text => onChange({...value,[field]:text === '' ? null : /^\d+$/.test(text) ? Number(text) : NaN})} />
    </View>)}</View>
    {(value.rep_min != null || value.rep_max != null) && <Button label={t('clearRepRange').replace('{name}',exercise)} variant="secondary" onPress={() => onChange({...value,rep_min:null,rep_max:null})} />}
  </View>;
}
