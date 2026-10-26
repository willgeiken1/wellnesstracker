import { FlatList, Keyboard, TextInput, View, ScrollView } from 'react-native';
import { useRef, useState } from 'react';
import { exerciseLibrary, type Exercise } from '@/core/workout/library';
import { filterExercises, validCustomExercise } from '@/core/workout/exercise-rules';
import { useTheme } from '@/design/theme-provider';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import type { WorkoutStore } from '@/data/workout/store';
import { muscleLabel, t } from '@/i18n/en';
import { Sheet, layout } from './primitives';
import { EquipmentChoices, MuscleChoices } from './exercise-choices';
export function ExercisePicker({ onPick, onClose, store }: { onPick: (name: string) => void; onClose: () => void; store?: WorkoutStore }) {
  const [query, setQuery] = useState(''), [muscle, setMuscle] = useState(''), [equipment, setEquipment] = useState(''), [creating, setCreating] = useState(false);
  const results = useRef<FlatList<Exercise>>(null);
  const { colors } = useTheme();
  const library = store?.preferences().library() ?? exerciseLibrary;
  const pick = (name: string) => { Keyboard.dismiss(); onPick(name); };
  const matches = filterExercises(library, query, muscle, equipment, store?.preferences().recent());
  return <Sheet expanded label={t('addExercise')} onClose={onClose}>
    {creating && store ? <CustomForm name={query.trim()} store={store} onPick={pick} onCancel={() => setCreating(false)} /> : <>
      <TextInput testID="exercise-picker-search" accessibilityLabel={t('searchExercise')} placeholder={t('searchExercise')} placeholderTextColor={colors['text-muted']} value={query} onChangeText={text => { setQuery(text); results.current?.scrollToOffset({ offset: 0, animated: false }); }} style={[layout.input, { color: colors.text, backgroundColor: colors['surface-2'] }]} />
      <MuscleChoices all filter value={muscle ? [muscle] : []} onChange={setMuscle} />
      <EquipmentChoices all value={equipment} onChange={setEquipment} />
      <FlatList ref={results} testID="exercise-picker-results" data={matches} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={layout.stack} keyExtractor={e => e.name} initialNumToRender={12} renderItem={({ item, index }) => <View>
        <Button testID={`exercise-picker-result-${index}`} label={item.name} variant="secondary" onPress={() => pick(item.name)} />
        {!!item.main && <ThemedText muted variant="caption">{t('mainMuscle').replace('{muscle}', muscleLabel(item.main))}{item.helpers.length ? ` · ${item.helpers.map(muscleLabel).join(', ')}` : ''}</ThemedText>}
      </View>} ListHeaderComponent={store && query.trim() && !library.some(e => e.name.toLowerCase() === query.trim().toLowerCase()) ? <Button label={t('createCustom').replace('{name}', query.trim())} onPress={() => setCreating(true)} /> : undefined} />
    </>}
  </Sheet>;
}
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
