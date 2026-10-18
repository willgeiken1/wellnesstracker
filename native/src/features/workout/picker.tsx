import { FlatList, Keyboard, TextInput } from 'react-native';
import { useRef, useState } from 'react';
import { exerciseLibrary } from '@/core/workout/library';
import { useTheme } from '@/design/theme-provider';
import { Button } from '@/components/button';
import { t } from '@/i18n/en';
import { Sheet, layout } from './primitives';
export function ExercisePicker({
  onPick,
  onClose
}: {
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const results = useRef<FlatList<(typeof exerciseLibrary)[number]>>(null);
  const {
    colors
  } = useTheme();
  const pick = (name: string) => { Keyboard.dismiss(); onPick(name); };
  const matches = exerciseLibrary.filter(e => e.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <Sheet expanded label={t('addExercise')} onClose={onClose}>
    <TextInput testID="exercise-picker-search" accessibilityLabel={t('searchExercise')} placeholder={t('searchExercise')} placeholderTextColor={colors['text-muted']} value={query} onChangeText={text => { setQuery(text); results.current?.scrollToOffset({ offset: 0, animated: false }); }} style={[layout.input, {
      color: colors.text,
      backgroundColor: colors['surface-2']
    }]} />
    <FlatList ref={results} testID="exercise-picker-results" data={matches} style={{
      flex: 1
    }} keyboardShouldPersistTaps="handled" contentContainerStyle={layout.stack} keyExtractor={e => e.name} initialNumToRender={12} renderItem={({
      item, index
    }) => <Button testID={`exercise-picker-result-${index}`} label={item.name} variant="secondary" onPress={() => pick(item.name)} />} ListHeaderComponent={query.trim() && !exerciseLibrary.some(e => e.name.toLowerCase() === query.trim().toLowerCase()) ? <Button label={t('createCustom').replace('{name}', query.trim())} onPress={() => pick(query.trim())} /> : undefined} />
  </Sheet>;
}
