import { useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { touchTarget } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import type { Row } from '@/data/rows';
import type { WorkoutStore } from '@/data/workout/store';
import { localDay } from '@/core/workout/rules';
import { t } from '@/i18n/en';
import { Sheet, clock, layout } from './primitives';
import { Field, Primary, Trouble, semibold } from './parts';
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
    [error, setError] = useState(false),
    [saving, setSaving] = useState(false);
  // What will be saved, as plain counts. Skipped exercises and sets that were never logged are left out.
  const entries = store.entries(session.id).filter(e => !store.skipped(e.id)),
    logged = entries.reduce((n, e) => n + store.sets(e.id).length, 0),
    facts = [[clock(Number(duration)), t('duration')], [String(logged), t('setsLabel')], [String(entries.length), t('summaryExercises')]];
  return <Sheet label={t('finishWorkout')} onClose={onClose}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={layout.stack}>
    <View testID="finish-facts" style={{ flexDirection: 'row', borderRadius: 16, paddingVertical: tokens.spacing[2], backgroundColor: colors['surface-2'] }}>
      {facts.map(([value, label], i) => <View key={label} accessible accessibilityLabel={`${label}: ${value}`} style={{ flex: 1, alignItems: 'center', gap: 2, borderLeftWidth: i ? 1 : 0, borderColor: colors['hair-2'] }}>
        <ThemedText numeric style={{ fontSize: 20 }}>{value}</ThemedText>
        <ThemedText muted variant="caption" style={[semibold, { textAlign: 'center' }]}>{label}</ThemedText>
      </View>)}
    </View>
    {logged === 0 && <ThemedText muted variant="caption">{t('finishNoSets')}</ThemedText>}
    <Field label={t('finishName')} accessibilityLabel={t('workoutName')} placeholder={t('workoutName')} value={name} onChangeText={setName} />
    <Field label={t('startDateTime')} hint={t('finishStartHint')} value={start} onChangeText={setStart} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" />
    <Field label={t('durationSeconds')} value={duration} onChangeText={setDuration} keyboardType="number-pad" />
    <Field label={t('notes')} placeholder={t('finishNotesHint')} value={notes} onChangeText={setNotes} maxLength={2000} multiline inputStyle={{ minHeight: 88, textAlignVertical: 'top' }} />
    {session.data.origin === 'empty' && <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2], minHeight: touchTarget }}>
      <View style={{ flex: 1 }}>
        <ThemedText style={semibold}>{t('saveAsTemplate')}</ThemedText>
        <ThemedText muted variant="caption">{t('finishTemplateHint')}</ThemedText>
      </View>
      <Switch hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={t('saveAsTemplate')} value={saveTemplate} onValueChange={setSaveTemplate} trackColor={{ true: colors.accent }} />
    </View>}
    {error && <Trouble text={t('invalidFinish')} />}
    <View><Primary testID="save-workout" label={t('saveWorkout')} disabled={saving} onPress={() => {
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
          } catch {
            setSaving(false);
            setError(true);
          }
        }} /></View>
  </ScrollView></Sheet>;
}
