import { View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Line, Path } from 'react-native-svg';
import { useLayoutMotion } from '@/components/layout-motion';
import { Screen } from '@/components/screen';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { rs } from '@/i18n/en';
import { blockMoves, moveBlock, showBlock } from '@/features/routines/model/blocks';
import { routineBlockDays, routineBlockWindow } from '@/features/routines/model/dose';
import type { RoutineBlock } from '@/features/routines/model/shape';
import { routineDaysLabel, routineWindowLabel } from '@/features/routines/model/types';
import { WINDOW_ARC, arcSegmentPath, arcSegments } from './add-item-arc';
import { commitRoutines, routineClockNow, useRoutines } from './add-item-data';
import { announce } from './add-item-frame';
import { Glyph } from './add-item-glyphs';
import { slotColor } from './add-item-tones';
import { routineRoutes } from './entry-points';

/** The small sun path beside a routine: where its window sits in the day. Decorative; the line under the name says the times. */
function Thumbnail({ block }: { block: RoutineBlock }) {
  const { colors } = useTheme();
  const shape = WINDOW_ARC;
  return <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
    <Svg width={46} height={30} viewBox={`0 ${shape.hy - shape.ry - 10} ${shape.width} ${shape.ry + 22}`} accessible={false}>
      <Path d={arcSegmentPath(shape.startMin, shape.endMin, shape)} fill="none" stroke={colors['text-muted']} strokeWidth={6} strokeDasharray="4 16" strokeLinecap="round" />
      <Line x1={shape.x0 - 10} y1={shape.hy} x2={shape.x1 + 10} y2={shape.hy} stroke={colors['text-muted']} strokeWidth={5} />
      {arcSegments(routineBlockWindow(block), shape).map(([from, to], part) => (
        <Path key={part} d={arcSegmentPath(from, to, shape)} fill="none" stroke={slotColor(colors, block.color)} strokeWidth={22} strokeLinecap="round" />
      ))}
    </Svg>
  </View>;
}

/**
 * Edit routines: every routine on the page in order, each with Move up and
 * Move down and a way into its own sheet, then New routine, then the hidden
 * ones with Restore. A move or a restore is saved at once.
 */
export function EditRoutines() {
  const { colors } = useTheme();
  const glide = useLayoutMotion();
  const data = useRoutines();
  const blocks = data.view ? data.view.blocks : [];
  const hidden = data.view ? data.view.hiddenBlocks : [];

  const move = (block: RoutineBlock, by: -1 | 1) => {
    const next = moveBlock(data.store, block.id, by, routineClockNow(data.store));
    if (!next || !commitRoutines(data.repository, next)) { announce(rs('notSaved')); return; }
    glide();
    announce(rs('movedTo', { name: block.name, place: blocks.findIndex((row) => row.id === block.id) + 1 + by, count: blocks.length }));
  };
  const restore = (block: RoutineBlock) => {
    const next = showBlock(data.store, block.id, routineClockNow(data.store));
    if (!next || !commitRoutines(data.repository, next)) { announce(rs('notSaved')); return; }
    glide();
    announce(rs('movedTo', { name: block.name, place: blocks.length + 1, count: blocks.length + 1 }));
  };
  const moveButton = (block: RoutineBlock, by: -1 | 1, allowed: boolean) => (
    <Tappable dim="fill" testID={`edit-routines-${by < 0 ? 'up' : 'down'}-${block.id}`} accessibilityRole="button" accessibilityLabel={rs(by < 0 ? 'moveUpNamed' : 'moveDownNamed', { name: block.name })}
      accessibilityState={{ disabled: !allowed }} disabled={!allowed} onPress={() => move(block, by)}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors['surface-2'], opacity: allowed ? 1 : 0.35 }}>
      <Glyph name={by < 0 ? 'up' : 'down'} size={20} color={colors.text} weight={2.2} />
    </Tappable>
  );
  const lines = (block: RoutineBlock) => <View style={{ flex: 1, minWidth: 120, gap: 2 }}>
    <ThemedText style={{ fontWeight: '600' }}>{block.name}</ThemedText>
    <ThemedText variant="caption" numeric muted>{routineWindowLabel(block) || rs('noTime')}</ThemedText>
    <ThemedText variant="caption" muted>{routineDaysLabel(routineBlockDays(block))}</ThemedText>
  </View>;

  return <Screen title={rs('editRoutines')}>
    <ThemedText testID="edit-routines-intro" muted>{rs('editIntro')}</ThemedText>
    {blocks.map((block) => {
      const moves = blockMoves(data.view, block.id);
      return <View key={block.id} testID={`edit-routines-row-${block.id}`}
        style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: tokens.spacing[1], backgroundColor: colors.surface, borderRadius: 18, padding: tokens.spacing[2] }}>
        <Thumbnail block={block} />
        {lines(block)}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[0] }}>
          {moveButton(block, -1, moves.up)}
          {moveButton(block, 1, moves.down)}
          <Tappable dim="fill" testID={`edit-routines-edit-${block.id}`} accessibilityRole="button" accessibilityLabel={rs('editNamed', { name: block.name })} onPress={() => router.push(routineRoutes.editRoutine(block.id))}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: tokens.spacing[2], borderRadius: 22, backgroundColor: colors['surface-2'] }}>
            <ThemedText variant="caption" style={{ fontWeight: '600' }}>{rs('edit')}</ThemedText>
          </Tappable>
        </View>
      </View>;
    })}
    <Tappable dim="fill" testID="edit-routines-new" accessibilityRole="button" accessibilityLabel={rs('newRoutine')} onPress={() => router.push(routineRoutes.newRoutine())}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.spacing[1], minHeight: 56, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors['text-muted'] }}>
      <Glyph name="add" size={18} color={colors.text} weight={2.2} />
      <ThemedText style={{ fontWeight: '600' }}>{rs('newRoutine')}</ThemedText>
    </Tappable>
    {!!hidden.length && <>
      <ThemedText variant="headline" accessibilityRole="header" style={{ fontWeight: '600' }}>{rs('hidden')}</ThemedText>
      {hidden.map((block) => (
        <View key={block.id} testID={`edit-routines-hidden-${block.id}`}
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: tokens.spacing[1], borderRadius: 18, borderWidth: 1.5, borderColor: colors['hair-2'], padding: tokens.spacing[2] }}>
          {lines(block)}
          <Tappable dim="fill" testID={`edit-routines-restore-${block.id}`} accessibilityRole="button" accessibilityLabel={rs('restoreNamed', { name: block.name })} onPress={() => restore(block)}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: tokens.spacing[2], borderRadius: 22, backgroundColor: colors['surface-2'] }}>
            <ThemedText variant="caption" style={{ fontWeight: '600' }}>{rs('restore')}</ThemedText>
          </Tappable>
        </View>
      ))}
    </>}
  </Screen>;
}
