import { Host, List, ListItem, RNHostView } from '@expo/ui';
import { Image } from 'expo-image';
import { useWindowDimensions, View } from 'react-native';
import type { Repository } from '@/data/repository';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { useWorkoutStore } from '@/features/workout/use-workout';
import { t } from '@/i18n/en';
import { Label, TonePanel } from './presentation';

export function ProgressCollection({ repository, section }: { repository: Repository; section: 'photos' | 'goals' }) {
 const { fontScale } = useWindowDimensions();
 const store = useWorkoutStore(repository);
 const { colors } = useTheme();
 if (section === 'photos') {
  const photos = store.repo.list('photos').sort((a, b) => Number(b.data.captured_at) - Number(a.data.captured_at));
  if (!photos.length) return <TonePanel><Label>{t('progressPhotosEmpty')}</Label><ThemedText muted>{t('progressPhotosHint')}</ThemedText></TonePanel>;
  return <View testID="photo-grid" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
   {photos.map(photo => {
    const path = String(photo.data.file_name ?? '');
    // Remote object names are metadata, never image URLs. No download or new health read.
    const local = path.startsWith('file://') && !path.includes('..');
    const date = typeof photo.data.captured_at === 'number' ? new Date(photo.data.captured_at).toLocaleDateString() : t('progressUndated');
    return <View key={photo.id} style={{ width: '30%', flexGrow: 0, gap: 4 }}>
     {local ? <Image source={{ uri: path }} accessibilityLabel={t('progressPhotoLabel').replace('{date}', date)} style={{ width: '100%', aspectRatio: 1, borderRadius: 8 }} /> : <View style={{ aspectRatio: 1, justifyContent: 'center', padding: 8, backgroundColor: colors['surface-2'] }}><ThemedText muted variant="caption">{t('progressPhotoMissing')}</ThemedText></View>}
     <ThemedText muted numeric variant="caption">{date}</ThemedText>
    </View>;
   })}
  </View>;
 }
 const goals = store.repo.list('goals');
 const records = store.history().flatMap(session => store.summary(session.id).prs.map(pr => ({ ...pr, id: `${session.id}:${pr.exercise}`, day: String(session.data.day) })));
 return <View style={{ gap: 16 }}>
  <Label>{t('progressGoals')}</Label>
  {!goals.length ? <TonePanel><Label>{t('progressGoalsEmpty')}</Label><ThemedText muted>{t('progressGoalsHint')}</ThemedText></TonePanel> : <Host style={{ height: Math.min(5, goals.length) * 112 * fontScale + 64 }}><List>{goals.map(goal => <ListItem key={goal.id}>
   <RNHostView matchContents><View style={{ minHeight: 44, gap: 4 }}><Label>{String(goal.data.kind ?? t('progressGoal'))}</Label><ThemedText numeric>{`${goal.data.target_value ?? '—'} ${goal.data.target_unit ?? ''}`.trim()}</ThemedText><ThemedText muted variant="caption">{goal.data.target_day ? t('progressTargetDate').replace('{day}', String(goal.data.target_day)) : t('progressNoTargetDate')}</ThemedText></View></RNHostView>
  </ListItem>)}</List></Host>}
  <Label>{t('progressRecords')}</Label>
  {!records.length ? <ThemedText muted>{t('progressRecordsEmpty')}</ThemedText> : <Host style={{ height: Math.min(5, records.length) * 112 * fontScale + 64 }}><List>{records.map(record => <ListItem key={record.id}>
   <RNHostView matchContents><View style={{ minHeight: 44, gap: 4 }}><Label>{record.exercise}</Label><ThemedText numeric>{record.displayWeight.toFixed(1)} {record.unit} × {record.bestReps}</ThemedText><ThemedText muted variant="caption">{record.day}</ThemedText></View></RNHostView>
  </ListItem>)}</List></Host>}
 </View>;
}
