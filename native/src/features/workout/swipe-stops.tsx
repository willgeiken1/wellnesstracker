import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';

/** How far the content travels to commit a swipe: the width of the action revealed beside it. */
export const SWIPE_REVEAL = 96;
/** How far the finger has to carry the content before letting go for the swipe to count. */
export const SWIPE_COMMIT = 40;
export type SwipeAction = { label: string; onCommit: () => void };

/** Swipe actions on native scrolling: a horizontal scroll view with a stop for each action beside the content.
 *
 * The system tracks the finger, so the drag cannot be lost to the page's own scrolling or to a screen that
 * re-renders every second, and the content moves and settles with the phone's own scroll physics.
 * `start` is revealed by swiping right, `end` by swiping left. A swipe counts only when the finger itself carried
 * the content most of the way: the snap finishes the travel, so without this a short flick would commit. The
 * intent is set when the finger lifts and used up by one action, so the two end-of-scroll events for the same
 * swipe cannot fire it twice. After an action the content goes back to rest without animating, and a swipe that
 * did not count slides back, or jumps back under Reduce Motion.
 *
 * The revealed words are not accessible: give the content the same actions as accessibility actions. */
export function SwipeStops({ testID, start, end, bleed = 0, style, children }: {
  testID: string; start?: SwipeAction; end?: SwipeAction;
  /** Room above and below the content for a shadow, taken back by a margin so the layout does not move. */
  bleed?: number; style?: StyleProp<ViewStyle>; children: ReactNode;
}) {
  const { reduceMotion } = useTheme();
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null), [width, setWidth] = useState(0);
  // Without a start action there is no stop on the left, so the content rests at the beginning.
  const rest = start ? SWIPE_REVEAL : 0, endAt = rest + SWIPE_REVEAL;
  const intent = useRef<'start' | 'end' | null>(null);
  const at = (e: NativeSyntheticEvent<NativeScrollEvent>) => e.nativeEvent.contentOffset.x;
  const goHome = () => scroller.current?.scrollTo({ x: rest, animated: !reduceMotion });
  const commit = (x: number) => {
    const want = intent.current, away = Math.abs(x - rest) >= 1;
    if (!want || (want === 'start' ? x > 1 : x < endAt - 1)) {
      // Whatever did not count as a swipe ends back at rest, so the next one is always measured from there.
      if (away) { intent.current = null; goHome(); }
      return;
    }
    intent.current = null;
    scroller.current?.scrollTo({ x: rest, animated: false });
    (want === 'start' ? start : end)?.onCommit();
  };
  const released = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = at(e), moved = x - rest;
    intent.current = end && moved >= SWIPE_COMMIT ? 'end' : start && -moved >= SWIPE_COMMIT ? 'start' : null;
    if (!intent.current) { if (x !== rest) goHome(); return; }
    // Released exactly on its stop there is no glide to wait for; otherwise the end of the glide decides.
    if (intent.current === 'start' ? x <= 1 : x >= endAt - 1) commit(x);
  };
  const reveal = (label: string, side: 'left' | 'right') => <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
    style={{ width: SWIPE_REVEAL, justifyContent: 'center', alignItems: side === 'left' ? 'flex-start' : 'flex-end', paddingHorizontal: tokens.spacing[1] }}>
    <ThemedText muted variant="caption" style={{ fontWeight: '600' }}>{label}</ThemedText>
  </View>;
  return <View testID={`${testID}-frame`} style={style} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
    <ScrollView ref={scroller} testID={testID} horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      scrollEnabled={!!(start || end)}
      // Keyed by the stops so the resting place is re-applied when an action appears or goes away.
      key={`${rest}:${width}`} contentOffset={{ x: rest, y: 0 }}
      snapToOffsets={[...(start ? [0] : []), rest, ...(end ? [endAt] : [])]} snapToEnd={false} snapToStart={false} decelerationRate="fast" disableIntervalMomentum
      directionalLockEnabled scrollsToTop={false} overScrollMode="never"
      onScrollBeginDrag={() => { intent.current = null; }} onScrollEndDrag={released} onMomentumScrollEnd={e => commit(at(e))} scrollEventThrottle={16}
      contentContainerStyle={bleed ? { paddingVertical: bleed } : undefined} style={bleed ? { marginVertical: -bleed } : undefined}>
      {start && reveal(start.label, 'left')}
      <View style={{ width: width || undefined }}>{children}</View>
      {end && reveal(end.label, 'right')}
    </ScrollView>
  </View>;
}
