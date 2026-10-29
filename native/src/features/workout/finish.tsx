import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import type { Row } from '@/data/rows';
import type { WorkoutStore } from '@/data/workout/store';
import { localDay } from '@/core/workout/rules';
import { t } from '@/i18n/en';
import { Sheet, clock, layout } from './primitives';
export function parseLocalDateTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value);
  if (!match) return NaN;
  const [, y, m, d, h, min] = match.map(Number),
    date = new Date(y, m - 1, d, h, min);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d && date.getHours() === h && date.getMinutes() === min ? date.getTime() : NaN;
}
export function formatLocalDateTime(stamp: number) {
  const d = new Date(stamp);
  return `${localDay(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function FinishSheet({
  store,
  session,
  onClose
}: {
  store: WorkoutStore;
  session: Row;
  onClose: () => void;
}) {
  const {
    colors
  } = useTheme();
  const [end] = useState(() => session.data.finished_at != null ? Number(session.data.finished_at) : store.pastMode(session.id) ? Number(session.data.started_at) : Date.now()),
    [start, setStart] = useState(formatLocalDateTime(Number(session.data.started_at))),
    [duration, setDuration] = useState(() => String(Math.max(0, (session.data.finished_at != null ? (end - Number(session.data.started_at)) / 1000 : Math.floor((end - Number(session.data.started_at)) / 1000))))),
    [notes, setNotes] = useState(String(session.data.notes ?? '')),
    [name, setName] = useState(String(session.data.name ?? '')),
    [saveTemplate, setSaveTemplate] = useState(false),
    [error, setError] = useState<'invalid' | 'save' | null>(null),
    [saving, setSaving] = useState(false);
  const inputStyle = [layout.input, {
    color: colors.text,
    backgroundColor: colors['surface-2']
  }];
  return <Sheet label={t('finishWorkout')} onClose={onClose}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={layout.stack}>
    <ThemedText muted>{t('duration')} · {clock(Number(duration))}</ThemedText>
    <TextInput accessibilityLabel={t('workoutName')} placeholder={t('workoutName')} placeholderTextColor={colors['text-muted']} value={name} onChangeText={setName} style={inputStyle} />
    <ThemedText muted variant="caption">{t('startDateTime')}</ThemedText><TextInput accessibilityLabel={t('startDateTime')} value={start} onChangeText={setStart} style={inputStyle} autoCapitalize="none" />
    <ThemedText muted variant="caption">{t('durationSeconds')}</ThemedText><TextInput accessibilityLabel={t('durationSeconds')} value={duration} onChangeText={setDuration} keyboardType="number-pad" style={inputStyle} />
    <TextInput accessibilityLabel={t('notes')} placeholder={t('notes')} placeholderTextColor={colors['text-muted']} value={notes} onChangeText={setNotes} maxLength={2000} multiline style={[inputStyle, {
        minHeight: 88
      }]} />
    {session.data.origin === 'empty' && <Button label={t('saveAsTemplate')} selected={saveTemplate} variant="secondary" onPress={() => setSaveTemplate(v => !v)} />}
    {error && <ThemedText accessibilityRole="alert">{error === 'invalid' ? t('invalidFinish') : 'Could not save this workout.'}</ThemedText>}
    <View><Button testID="save-workout" label={error ? 'Try again' : t('saveWorkout')} disabled={saving} onPress={() => {
          if (saving) return;
          setSaving(true);
          try {
            const startedAt = start === formatLocalDateTime(Number(session.data.started_at)) ? Number(session.data.started_at) : parseLocalDateTime(start),
              seconds = Number(duration);
            if (!Number.isFinite(seconds) || seconds < 0 || duration.trim() === '') throw Error('Invalid duration.');
            store.finish(session.id, {
              startedAt,
              finishedAt: startedAt + seconds * 1000,
              notes,
              name,
              saveTemplate
            });
            router.replace({
              pathname: '/workout/summary',
              params: {
                id: session.id
              }
            });
          } catch (failure) {
            setSaving(false);
            setError(failure instanceof Error && ['Invalid duration.','Invalid date.'].includes(failure.message) ? 'invalid' : 'save');
          }
        }} /></View>
  </ScrollView></Sheet>;
}
