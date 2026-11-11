import { ScrollView, View } from 'react-native';
import { muscles, equipmentTypes } from '@/core/workout/exercise-rules';
import { tokens } from '@/design/tokens';
import { equipmentLabel, muscleLabel, t } from '@/i18n/en';
import { Pick } from './parts';
/** A sideways row of choices. Each shows the short name; screen readers hear what the choice is for. */
function Choices({ children }: { children: React.ReactNode }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1] }}>{children}</View>
  </ScrollView>;
}
export function MuscleChoices({ value, onChange, helper = false, all = false, filter = false }: { value: string[]; onChange: (muscle: string) => void; helper?: boolean; all?: boolean; filter?: boolean }) {
  const label = filter ? 'muscleFilter' : helper ? 'helperMuscle' : 'mainMuscle';
  return <Choices>
    {all && <Pick onSurface text={t('allMuscles')} selected={!value.length} onPress={() => onChange('')} />}
    {muscles.map(m => <Pick key={m} onSurface text={muscleLabel(m)} label={t(label).replace('{muscle}', muscleLabel(m))} selected={value.includes(m)} onPress={() => onChange(m)} />)}
  </Choices>;
}
export function EquipmentChoices({ value, onChange, all = false }: { value: string; onChange: (equipment: string) => void; all?: boolean }) {
  return <Choices>
    {all && <Pick onSurface text={t('allEquipment')} selected={!value} onPress={() => onChange('')} />}
    {equipmentTypes.map(e => <Pick key={e} onSurface text={equipmentLabel(e)} label={t('equipmentChoice').replace('{equipment}', equipmentLabel(e))} selected={value === e} onPress={() => onChange(e)} />)}
  </Choices>;
}
