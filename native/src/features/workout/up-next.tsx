import { Pressable, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { SwipeStops } from './swipe-stops';
import { useStacked } from '@/components/text-size';

export { SWIPE_COMMIT, SWIPE_REVEAL } from './swipe-stops';
/** The card at the top of the logger: the exercise with the next open set. Tap to log that set,
 * swipe right to skip the exercise, swipe left to swap it. Screen readers get the same two as actions. */
export function UpNext({ name, detail, onPress, onSkip, onSwap }: { name: string; detail: string; onPress: () => void; onSkip?: () => void; onSwap: () => void }) {
  const { colors } = useTheme(), training = colors.training;
  // A long name wraps at the largest text sizes instead of being cut off.
  const stacked = useStacked();
  const actions = [...(onSkip ? [{ name: 'skip', label: t('skipExercise') }] : []), { name: 'swap', label: t('swapExercise') }];
  return <View testID="logger-up-next" style={{ gap: tokens.spacing[1] }}>
    <ThemedText muted variant="caption" style={{ paddingHorizontal: tokens.spacing[0] }}>{t(onSkip ? 'upNextSwipe' : 'upNextSwipeSwap')}</ThemedText>
    <View>
      <View style={{ position: 'absolute', left: 14, right: 14, bottom: -7, height: 28, borderRadius: 18, backgroundColor: colors.surface, opacity: 0.6 }} />
      {/* Room above and below for the card's shadow. */}
      <SwipeStops testID="up-next-swipe" bleed={6} start={onSkip ? { label: t('skip'), onCommit: onSkip } : undefined} end={{ label: t('swapShort'), onCommit: onSwap }}>
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
            <ThemedText variant="title" numberOfLines={stacked ? undefined : 1} style={{ fontWeight: '600' }}>{name}</ThemedText>
            <ThemedText muted numeric>{detail}</ThemedText>
          </Pressable>
      </SwipeStops>
    </View>
  </View>;
}
