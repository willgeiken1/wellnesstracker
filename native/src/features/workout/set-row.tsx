import { PanResponder, Pressable, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import type { Draft } from '@/data/workout/store';
import { t } from '@/i18n/en';
import { Line, layout } from './primitives';
export function SetRow({
  exerciseIndex = 0,
  exercise,
  index,
  draft,
  previous,
  hint,
  onEdit,
  onDone,
  onRemove
}: {
  exerciseIndex?: number;
  exercise: string;
  index: number;
  draft: Draft;
  previous: string;
  hint: string;
  onEdit: (field: 'weight' | 'reps') => void;
  onDone: () => void;
  onRemove: () => void;
}) {
  const {
    colors
  } = useTheme();
  const label = `${exercise}, ${t('set')} ${index + 1}`;
  const pan = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dx > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderRelease: (_, g) => {
      if (g.dx > 65 && !draft.setId) onDone();
    }
  });
  return <View {...pan.panHandlers} style={[layout.row, {
    paddingVertical: 4,
    backgroundColor: draft.setId ? `${colors.accent}22` : undefined,
    borderRadius: 8
  }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${t('removeSet')}`} onLongPress={onRemove} onPress={() => {}} accessibilityActions={[{
      name: 'delete',
      label: t('removeSet')
    }]} onAccessibilityAction={e => {
      if (e.nativeEvent.actionName === 'delete') onRemove();
    }} style={[layout.cell, {
      width: 36
    }]}><ThemedText numeric muted>{index + 1}</ThemedText></Pressable>
    <ThemedText muted numeric variant="caption" style={{
      flex: 1
    }}>{previous || '—'}</ThemedText>
    {(['weight', 'reps'] as const).map(field => <Pressable testID={`set-${exerciseIndex}-${index}-${field}`} key={field} accessibilityRole="button" accessibilityLabel={`${label}, ${t(field)}, ${draft[field] || t('blank')}`} onPress={() => onEdit(field)} style={[layout.cell, {
      flex: 1,
      backgroundColor: draft.setId ? undefined : colors['surface-2']
    }]}><ThemedText numeric muted={!draft[field]}>{draft[field] || (field === 'weight' ? hint : '—')}</ThemedText></Pressable>)}
    <Pressable testID={`set-${exerciseIndex}-${index}-done`} accessibilityRole="checkbox" accessibilityLabel={`${label}, ${t('done')}`} accessibilityState={{
      checked: !!draft.setId
    }} onPress={onDone} style={[layout.cell, {
      width: 44,
      backgroundColor: draft.setId ? colors.accent : colors['surface-2']
    }]}><Line name="check" color={draft.setId ? colors['on-accent'] : colors['text-muted']} /></Pressable>
  </View>;
}
