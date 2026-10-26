import { ScrollView, View } from 'react-native';
import { Button } from '@/components/button';
import { muscles, equipmentTypes } from '@/core/workout/exercise-rules';
import { equipmentLabel, muscleLabel, t } from '@/i18n/en';
import { layout } from './primitives';
export function MuscleChoices({ value, onChange, helper = false, all = false, filter = false }: { value: string[]; onChange: (muscle: string) => void; helper?: boolean; all?: boolean; filter?: boolean }) {
  const label = filter ? 'muscleFilter' : helper ? 'helperMuscle' : 'mainMuscle';
  return <ScrollView horizontal style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled"><View style={layout.row}>
    {all && <Button label={t('allMuscles')} variant="secondary" selected={!value.length} onPress={() => onChange('')} />}
    {muscles.map(m => <Button key={m} label={t(label).replace('{muscle}', muscleLabel(m))} selected={value.includes(m)} variant="secondary" onPress={() => onChange(m)} />)}
  </View></ScrollView>;
}
export function EquipmentChoices({ value, onChange, all = false }: { value: string; onChange: (equipment: string) => void; all?: boolean }) {
  return <ScrollView horizontal style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled"><View style={layout.row}>
    {all && <Button label={t('allEquipment')} selected={!value} variant="secondary" onPress={() => onChange('')} />}
    {equipmentTypes.map(e => <Button key={e} label={t('equipmentChoice').replace('{equipment}', equipmentLabel(e))} selected={value === e} variant="secondary" onPress={() => onChange(e)} />)}
  </View></ScrollView>;
}
