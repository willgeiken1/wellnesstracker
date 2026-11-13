import { FlatList, Keyboard, Pressable, TextInput, ScrollView } from 'react-native';
import { useRef, useState } from 'react';
import { exerciseLibrary, type Exercise } from '@/core/workout/library';
import { filterExercises, validCustomExercise } from '@/core/workout/exercise-rules';
import { useTheme } from '@/design/theme-provider';
import { Button, touchTarget } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import type { WorkoutStore } from '@/data/workout/store';
import { muscleLabel, t } from '@/i18n/en';
import { Sheet, layout } from './primitives';
import { EquipmentChoices, MuscleChoices } from './exercise-choices';
import { useFieldOutline } from '@/components/field-outline';
export function ExercisePicker({ onPick, onClose, store, label = t('addExercise') }: { onPick: (name: string) => void; onClose: () => void; store?: WorkoutStore; label?: string }) {
  const [query, setQuery] = useState(''), [muscle, setMuscle] = useState(''), [equipment, setEquipment] = useState(''), [creating, setCreating] = useState(false);
  const results = useRef<FlatList<Exercise>>(null);
  const { colors } = useTheme();
  const outline = useFieldOutline();
  const library = store?.preferences().library() ?? exerciseLibrary;
  const pick = (name: string) => { Keyboard.dismiss(); onPick(name); };
  const matches = filterExercises(library, query, muscle, equipment, store?.preferences().recent());
  return <Sheet expanded label={label} onClose={onClose}>
    {creating && store ? <CustomForm name={query.trim()} store={store} onPick={pick} onCancel={() => setCreating(false)} /> : <>
      <TextInput testID="exercise-picker-search" accessibilityLabel={t('searchExercise')} placeholder={t('searchExercise')} placeholderTextColor={colors['text-muted']} value={query} onChangeText={text => { setQuery(text); results.current?.scrollToOffset({ offset: 0, animated: false }); }} style={[layout.input, { color: colors.text, backgroundColor: colors['surface-2'] }, outline]} />
      <MuscleChoices all filter value={muscle ? [muscle] : []} onChange={setMuscle} />
      <EquipmentChoices all value={equipment} onChange={setEquipment} />
      <FlatList ref={results} testID="exercise-picker-results" data={matches} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyExtractor={e => e.name} initialNumToRender={12} renderItem={({ item, index }) => <Pressable testID={`exercise-picker-result-${index}`} accessibilityRole="button" accessibilityLabel={item.name} accessibilityValue={item.main ? { text: muscleLine(item) } : undefined} onPress={() => pick(item.name)}
        style={({ pressed }) => ({ minHeight: touchTarget, justifyContent: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors['surface-2'], opacity: pressed ? 0.6 : 1 })}>
        <ThemedText>{item.name}</ThemedText>
        {!!item.main && <ThemedText muted variant="caption">{muscleLine(item)}</ThemedText>}
      </Pressable>} ListFooterComponent={store && query.trim() && !library.some(e => e.name.toLowerCase() === query.trim().toLowerCase()) ? <Button label={t('createCustom').replace('{name}', query.trim())} variant={matches.length ? 'secondary' : 'primary'} onPress={() => setCreating(true)} /> : undefined} />
    </>}
  </Sheet>;
}
/** The muscles line under an exercise name. Also read to screen readers as the row's value, since the row's label is the name. */
const muscleLine = (item: Exercise) => `${t('mainMuscle').replace('{muscle}', muscleLabel(item.main ?? ''))}${item.helpers.length ? ` · ${item.helpers.map(muscleLabel).join(', ')}` : ''}`;
function CustomForm({ name, store, onPick, onCancel }: { name: string; store: WorkoutStore; onPick: (name: string) => void; onCancel: () => void }) {
  const [main, setMain] = useState(''), [equipment, setEquipment] = useState(''), [helpers, setHelpers] = useState<string[]>([]), [error, setError] = useState(false);
  const exercise = { name, main, equipment, helpers };
  return <ScrollView contentContainerStyle={layout.stack} keyboardShouldPersistTaps="handled">
    <ThemedText>{name}</ThemedText><ThemedText>{t('customMuscles')}</ThemedText>
    <MuscleChoices value={main ? [main] : []} onChange={setMain} />
    <ThemedText>{t('customEquipment')}</ThemedText><EquipmentChoices value={equipment} onChange={setEquipment} />
    <ThemedText>{t('customHelpers')}</ThemedText><MuscleChoices helper value={helpers} onChange={m => setHelpers(v => v.includes(m) ? v.filter(h => h !== m) : [...v, m])} />
    {error && <ThemedText accessibilityRole="alert">{t('customExerciseError')}</ThemedText>}
    <Button label={t('saveExercise')} disabled={!validCustomExercise(exercise)} onPress={() => { try { store.preferences().saveCustom(exercise as Exercise); onPick(name); } catch { setError(true); } }} />
    <Button label={t('cancel')} variant="secondary" onPress={onCancel} />
  </ScrollView>;
}
