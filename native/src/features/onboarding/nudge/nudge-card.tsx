import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Button, KitText, useKit } from '@/components/kit';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
import { showToast } from '@/features/shell/toast';
import { PeakLine } from '../launch/peak-line';
import { nudgeDue, nudgeLater, type NudgeStore } from './model';

/** After Later the card fades out over 0.2 s, then `done` takes it off the page. */
function useFadeOut(leaving: boolean, done: () => void) {
  const v = useSharedValue(1);
  useEffect(() => {
    if (!leaving) return;
    v.value = withTiming(0, { duration: 200, easing: Easing.linear });
    const id = setTimeout(done, 200);
    return () => clearTimeout(id);
  }, [leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  return useAnimatedStyle(() => ({ opacity: v.value }));
}

/** Continue opens setup again at the sections that were skipped, then comes back to Home. */
export const NUDGE_RESUME: Href = { pathname: '/onboarding', params: { resume: '1' } } as unknown as Href;

/**
 * The nudge on Home, between the hero and the tiles (ob-nudge), when setup ended with About you or Goals skipped: the
 * mountain line lit for what is done, a title and line for what is left, Continue and Later. Later fades it out, comes
 * back after three days once, then leaves it to Settings. Never on sample data.
 */
export function NudgeCard({ store }: { store: NudgeStore | null }) {
  const k = useKit(), { reduceMotion } = useTheme();
  const [hidden, setHidden] = useState(false), [leaving, setLeaving] = useState(false);
  const nudge = useMemo(() => nudgeDue(store), [store, hidden]); // eslint-disable-line react-hooks/exhaustive-deps
  const fade = useFadeOut(leaving, () => setHidden(true));
  if (!store || !nudge || hidden) return null;
  const title = t(nudge.title);
  const later = () => {
    showToast(t(nudgeLater(store)));
    if (reduceMotion) setHidden(true); else setLeaving(true);
  };
  // The lit line follows the accent; the design draws it whole on Home, with the glow for how much is done.
  return <Animated.View testID="home-nudge" accessibilityRole="summary" accessibilityLabel={title}
    style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 12, padding: 16, borderRadius: 20,
      backgroundColor: k.c.surface, boxShadow: k.cardEdge }, fade]}>
    <View style={{ width: 56, marginTop: 4 }}><PeakLine testID="home-nudge-peak" width={56} frac={1} glow={nudge.frac} color={k.c.accent} /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <KitText weight={700} size={16.5} lineHeight={1.2} tracking={-0.015}>{title}</KitText>
      <KitText weight={500} size={13.5} lineHeight={1.4} color="text-muted" style={{ marginTop: 4 }}>{t(nudge.body)}</KitText>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Button testID="home-nudge-continue" size="sm" label={t('obaContinue')} onPress={() => router.push(NUDGE_RESUME)} />
        <Button testID="home-nudge-later" size="sm" variant="quiet" label={t('obaLater')} onPress={later} />
      </View>
    </View>
  </Animated.View>;
}
