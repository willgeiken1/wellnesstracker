import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tokens, type ThemeColors } from '@/design/tokens';
import { t, type MessageKey } from '@/i18n/en';
import { TileIcon } from '@/features/tiles/tile-icon';
import type { EmptyReason } from './state';

const COPY: Record<EmptyReason, MessageKey> = {
  connect: 'homeEmptyConnect', today: 'homeEmptyToday', night: 'homeEmptyNight', targets: 'homeEmptyTargets', next: 'homeEmptyNext',
  score: 'homeEmptyScore', weigh: 'homeEmptyWeigh', bodyFat: 'homeEmptyBodyFat', routines: 'homeEmptyRoutines', detail: 'homeEmptyDetail',
  goalWeight: 'homeEmptyGoalWeight', sleepStages: 'homeEmptySleepStages', noStages: 'homeEmptyNoStages',
};
export const emptyCopy = (why: EmptyReason) => t(COPY[why]);

/**
 * A tile with nothing to show yet: its own header (as the drawn tiles have) and one line on what fills it.
 * Drawn in the tile's body box, so the header sits at the frame's 16 pt padding like every drawn tile.
 */
export const EmptyTile = memo(function EmptyTile({ icon, title, tint, why, colors }: { icon: string; title: string; tint: string; why: EmptyReason | null; colors: ThemeColors }) {
  return <View style={styles.box}>
    <View style={styles.head}>
      <TileIcon name={icon} size={18} color={tint} />
      <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{title}</Text>
    </View>
    {why ? <Text numberOfLines={4} style={[styles.line, { color: colors['text-muted'] }]}>{emptyCopy(why)}</Text> : null}
  </View>;
});

const styles = StyleSheet.create({
  box: { flex: 1 },
  head: { height: 20, flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flexShrink: 1, minWidth: 0, fontFamily: tokens.font.bodyStrong, fontSize: 14, lineHeight: 20 },
  line: { marginTop: 'auto', fontFamily: tokens.font.body, fontSize: 13, lineHeight: 18 },
});
