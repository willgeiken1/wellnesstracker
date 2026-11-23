import { AccessibilityInfo, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Card } from '@/components/card';
import { useLayoutMotion } from '@/components/layout-motion';
import { useSelectionHaptic } from '@/components/selection-haptic';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { touchTarget } from '@/components/button';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { logItem } from '@/features/routines/model/actions';
import { ROUTINE_TILE_TEXT, revealRoutineJump, routineTile, routineTileJump, routineTileTarget, routineTrayEntries, type RoutineTile, type RoutineTrayEntry } from '@/features/routines/model/home-tiles';
import type { RoutineView } from '@/features/routines/model/shape';
import { slotColor } from '@/features/routines-ui/colors';
import { ROUTINES_DAY_VIEW, routineRoutes } from '@/features/routines-ui/entry-points';
import { Glyph } from '@/features/routines-ui/glyph';
import { TextButton, semibold } from '@/features/routines-ui/parts';
import type { Routines } from '@/features/routines-ui/use-routines';
import { routinesHomeText } from '@/i18n/en';
import type { RoutineTileId } from './tiles';

/* Routine tiles on Home: Next up, one routine, or one item. A tile shows what the person saved in Routines and
   lets them tick it off; it works nothing out. Everything stays on the phone: this file reads the routines it is
   handed, and sends, logs and reports nothing. */

/** Past this text size a half-width tile takes the whole row, so its words keep their room. */
export const TILE_STACKS_AT = 1.5;

/** Whether there is anything for a tile to show: its routine or item still exists, and Next up has items to
 * pick from. A tile whose routine was deleted stays in Edit Home, where it can be taken off. */
export function routineTileLive(view: RoutineView, id: RoutineTileId): boolean {
  const target = routineTileTarget(id);
  if (!target) return false;
  if (target.kind === 'block') return view.blocks.some(block => block.id === target.blockId);
  if (target.kind === 'item') return view.items.some(item => item.id === target.itemId);
  return view.items.length > 0;
}

/** What Edit Home calls a routine tile: the routine's or the item's own name. */
export function routineTileName(store: Routines['store'], id: RoutineTileId): string {
  const known = routineTrayEntries(store, []).find(entry => entry.id === id);
  if (known) return known.title;
  const target = routineTileTarget(id);
  return target?.kind === 'item' ? ROUTINE_TILE_TEXT.item : target?.kind === 'block' ? ROUTINE_TILE_TEXT.routine : ROUTINE_TILE_TEXT.next;
}
/** One line on what a routine tile shows, for its row in Edit Home. */
export function routineTileAbout(id: string): string {
  const target = routineTileTarget(id);
  return routinesHomeText(target?.kind === 'item' ? 'aboutItem' : target?.kind === 'block' ? 'aboutRoutine' : 'aboutNext');
}
/** The routine tiles that can still be added to Home, by title. */
export function routineTilesOffered(store: Routines['store'], placed: readonly string[], query = ''): RoutineTrayEntry[] {
  return routineTrayEntries(store, placed, query);
}

/** The colour a tile takes: its routine's, the first routine that holds its item, or the accent for Next up. */
function tileTone(view: RoutineView, id: RoutineTileId, colors: ReturnType<typeof useTheme>['colors']): string {
  const target = routineTileTarget(id);
  const blockId = target?.kind === 'block' ? target.blockId
    : target?.kind === 'item' ? view.placements.find(place => place.itemId === target.itemId)?.blockId
      : undefined;
  return slotColor(colors, view.blocks.find(block => block.id === blockId)?.color);
}

/** One routine tile. Half width it is a single line that opens Routines. Full width it lists what is still open
 * today, each with a Log button, under a header that opens Routines. */
export function RoutineHomeTile({ id, wide, routines, now }: { id: RoutineTileId; wide: boolean; routines: Routines; now: Date }) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const haptic = useSelectionHaptic(), glide = useLayoutMotion();
  const { store, view } = routines;
  const day = routines.dayOf(now);
  const tile = routineTileLive(view, id) ? routineTile(store, id, day, { size: wide ? 'medium' : 'small' }) : null;
  if (!tile) return null;
  const tone = tileTone(view, id, colors);
  const open = () => {
    const jump = routineTileJump(store, id, day);
    // A folded routine draws no rows, so the routine that holds the target is opened before the tab shows. The
    // saved fold covers the current routine; the link carries the target for the others, which the day folds itself.
    if (jump) routines.apply((current, clock) => revealRoutineJump(current, jump, clock));
    // The view is always named: Routines may have been left on a type tab, and a routine is on the day.
    router.navigate(routineRoutes.tab(jump ? jump.view : ROUTINES_DAY_VIEW, jump ? { blockId: jump.blockId, itemId: jump.itemId } : {}));
  };
  const log = (itemId: string, label: string) => {
    glide();
    if (!routines.apply((current, clock) => logItem(current, itemId, clock))) return;
    haptic();
    AccessibilityInfo.announceForAccessibility(routinesHomeText('loggedSpoken', { name: label }));
  };
  return wide ? <BigTile tile={tile} tone={tone} onOpen={open} onLog={log} /> : <SmallTile tile={tile} tone={tone} full={fontScale >= TILE_STACKS_AT} onOpen={open} />;
}

const card = { borderRadius: 18, padding: tokens.spacing[2] } as const;

function SmallTile({ tile, tone, full, onOpen }: { tile: RoutineTile; tone: string; full: boolean; onOpen: () => void }) {
  return <Tappable testID={`home-tile-${tile.id}`} accessibilityRole="button" onPress={onOpen}
    accessibilityLabel={routinesHomeText('tileOpens', { title: [tile.kicker, tile.title, tile.when].filter(Boolean).join(', ') })}
    style={{ width: full ? '100%' : '48.5%' }}>
    <Card style={[card, { minHeight: 108, gap: 2 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: tone }} />
        <ThemedText muted variant="caption" style={{ flex: 1 }}>{tile.kicker}</ThemedText>
      </View>
      <ThemedText style={semibold} numberOfLines={3}>{tile.title}</ThemedText>
      {!!tile.when && <ThemedText muted numeric variant="caption" style={{ marginTop: 'auto' }}>{tile.when}</ThemedText>}
    </Card>
  </Tappable>;
}

function BigTile({ tile, tone, onOpen, onLog }: { tile: RoutineTile; tone: string; onOpen: () => void; onLog: (itemId: string, label: string) => void }) {
  const { colors } = useTheme();
  return <View style={{ width: '100%' }}>
    <Card testID={`home-tile-${tile.id}`} style={[card, { gap: 0, paddingVertical: 0, paddingLeft: tokens.spacing[3], overflow: 'hidden' }]}>
      {/* The same bar a routine carries on its own tab, so the tile reads as that routine. */}
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: tone }} />
      <Tappable testID={`home-tile-open-${tile.id}`} accessibilityRole="button" onPress={onOpen}
        accessibilityLabel={routinesHomeText('tileOpens', { title: [tile.kicker, tile.when, tile.rows.length ? '' : tile.empty].filter(Boolean).join(', ') })}
        style={{ minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1] }}>
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: tokens.spacing[1] }}>
          <ThemedText variant="caption" style={[semibold, { color: tone }]}>{tile.kicker}</ThemedText>
          {!!tile.when && <ThemedText muted numeric variant="caption">{tile.when}</ThemedText>}
        </View>
        <Glyph name="forward" size={16} color={colors['text-muted']} />
      </Tappable>
      {tile.rows.map(row => <View key={row.itemId} testID={`home-tile-row-${row.itemId}`}
        style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], borderTopWidth: 1, borderTopColor: colors.hair }}>
        {/* The Log button speaks the row's words, so VoiceOver reads each row once. */}
        <View style={{ flex: 1, paddingVertical: tokens.spacing[0] }} accessibilityElementsHidden={row.canLog} importantForAccessibility={row.canLog ? 'no-hide-descendants' : 'auto'}>
          <ThemedText style={semibold}>{row.label}</ThemedText>
        </View>
        {row.canLog && <TextButton testID={`home-tile-log-${row.itemId}`} label={ROUTINE_TILE_TEXT.log} spoken={routinesHomeText('logSpoken', { name: row.label })} color={colors.text} pill
          onPress={() => onLog(row.itemId, row.label)} />}
      </View>)}
      {!!tile.more && <ThemedText muted numeric variant="caption" style={{ paddingVertical: tokens.spacing[2], borderTopWidth: 1, borderTopColor: colors.hair }}>{tile.more}</ThemedText>}
      {!tile.rows.length && <ThemedText muted variant="caption" style={{ paddingBottom: tokens.spacing[2] }}>{tile.empty}</ThemedText>}
    </Card>
  </View>;
}
