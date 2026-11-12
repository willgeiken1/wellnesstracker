import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';

/** How far the card travels to commit a swipe: the width of the action revealed beside it. */
export const SWIPE_REVEAL = 96;
/** How far the finger has to carry the card before letting go for the swipe to count. */
export const SWIPE_COMMIT = 40;
/** The card at the top of the logger: the exercise with the next open set. Tap to log that set,
 * swipe right to skip the exercise, swipe left to swap it. Screen readers get the same two as actions.
 *
 * The swipe is a native horizontal scroll view with three stops: skip, the card, swap. The system tracks the
 * finger, so the drag cannot be lost to the page's own scrolling or to the logger re-rendering each second, and
 * the card moves and settles with the phone's own scroll physics. After an action it goes back to rest without
 * animating, and a swipe that did not count slides back, or jumps back under Reduce Motion. */
export function UpNext({ name, detail, onPress, onSkip, onSwap }: { name: string; detail: string; onPress: () => void; onSkip?: () => void; onSwap: () => void }) {
  const { colors, reduceMotion } = useTheme(), training = colors.training;
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null), [width, setWidth] = useState(0);
  // Without skip there is no stop on the left, so the card rests at the start and only resists a right swipe.
  const rest = onSkip ? SWIPE_REVEAL : 0, swapAt = rest + SWIPE_REVEAL;
  // A swipe counts only when the finger itself carried the card most of the way: the snap finishes the travel, so
  // without this a short flick would commit. The intent is set when the finger lifts and used up by one action,
  // so the two end-of-scroll events for the same swipe cannot fire it twice.
  const intent = useRef<'skip' | 'swap' | null>(null);
  const at = (e: NativeSyntheticEvent<NativeScrollEvent>) => e.nativeEvent.contentOffset.x;
  const goHome = () => scroller.current?.scrollTo({ x: rest, animated: !reduceMotion });
  const commit = (x: number) => {
    const want = intent.current, away = Math.abs(x - rest) >= 1;
    if (!want || (want === 'skip' ? x > 1 : x < swapAt - 1)) {
      // Whatever did not count as a swipe ends back at rest, so the next one is always measured from there.
      if (away) { intent.current = null; goHome(); }
      return;
    }
    intent.current = null;
    scroller.current?.scrollTo({ x: rest, animated: false });
    if (want === 'skip') onSkip?.(); else onSwap();
  };
  const released = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = at(e), moved = x - rest;
    intent.current = moved >= SWIPE_COMMIT ? 'swap' : onSkip && -moved >= SWIPE_COMMIT ? 'skip' : null;
    if (!intent.current) { if (x !== rest) goHome(); return; }
    // Released exactly on its stop there is no glide to wait for; otherwise the end of the glide decides.
    if (intent.current === 'skip' ? x <= 1 : x >= swapAt - 1) commit(x);
  };
  const actions = [...(onSkip ? [{ name: 'skip', label: t('skipExercise') }] : []), { name: 'swap', label: t('swapExercise') }];
  const reveal = (label: string, side: 'left' | 'right') => <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
    style={{ width: SWIPE_REVEAL, justifyContent: 'center', alignItems: side === 'left' ? 'flex-start' : 'flex-end', paddingHorizontal: tokens.spacing[1] }}>
    <ThemedText muted variant="caption" style={{ fontWeight: '600' }}>{label}</ThemedText>
  </View>;
  return <View testID="logger-up-next" style={{ gap: tokens.spacing[1] }} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
    <ThemedText muted variant="caption" style={{ paddingHorizontal: tokens.spacing[0] }}>{t(onSkip ? 'upNextSwipe' : 'upNextSwipeSwap')}</ThemedText>
    <View>
      <View style={{ position: 'absolute', left: 14, right: 14, bottom: -7, height: 28, borderRadius: 18, backgroundColor: colors.surface, opacity: 0.6 }} />
      <ScrollView ref={scroller} testID="up-next-swipe" horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        // Keyed by the stops so the resting place is re-applied when skip appears or goes away.
        key={`${rest}:${width}`} contentOffset={{ x: rest, y: 0 }}
        snapToOffsets={onSkip ? [0, rest, swapAt] : [rest, swapAt]} snapToEnd={false} snapToStart={false} decelerationRate="fast" disableIntervalMomentum
        directionalLockEnabled scrollsToTop={false} overScrollMode="never"
        onScrollBeginDrag={() => { intent.current = null; }} onScrollEndDrag={released} onMomentumScrollEnd={e => commit(at(e))} scrollEventThrottle={16}
        // Room above and below for the card's shadow, taken back by the margin so the layout does not move.
        contentContainerStyle={{ paddingVertical: 6 }} style={{ marginVertical: -6 }}>
        {onSkip && reveal(t('skip'), 'left')}
        <View style={{ width: width || undefined }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${t('upNext')}: ${name}, ${detail}`} accessibilityHint={t('upNextHint')}
            accessibilityActions={actions} onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'skip') onSkip?.(); else if (e.nativeEvent.actionName === 'swap') onSwap(); }}
            onPress={onPress}
            style={({ pressed }) => ({ borderRadius: 22, overflow: 'hidden', backgroundColor: colors.surface, paddingVertical: tokens.spacing[4], paddingHorizontal: tokens.spacing[3], minHeight: 84, justifyContent: 'center', opacity: pressed ? 0.85 : 1, ...tokens.elevation.ios, shadowOpacity: 0.08 })}>
            <Svg accessible={false} pointerEvents="none" width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
              <Defs><LinearGradient id="upNext" x1="0" y1="0" x2="1" y2="0.6">
                <Stop offset="0" stopColor={training} stopOpacity={0.26} />
                <Stop offset="0.62" stopColor={training} stopOpacity={0} />
              </LinearGradient></Defs>
              <Rect x="0" y="0" width="100" height="100" fill="url(#upNext)" />
            </Svg>
            <ThemedText variant="title" numberOfLines={1} style={{ fontWeight: '600' }}>{name}</ThemedText>
            <ThemedText muted numeric>{detail}</ThemedText>
          </Pressable>
        </View>
        {reveal(t('swapShort'), 'right')}
      </ScrollView>
    </View>
  </View>;
}
