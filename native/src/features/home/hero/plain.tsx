import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { alpha, capitals } from '@/components/kit-style';
import { KitText } from '@/components/themed-text';
import { t } from '@/i18n/en';
import type { HeroPillar, HeroView } from './model';
import { FadeUp, TEXT_MOTION, useCountTo } from './text-motion';

/**
 * Numbers only (the map turned off, or a phone that can't draw it): the day score, then the three pillars side by side, each
 * with its real value, its goal and a hairline bar that slides when the day changes.
 */
export const PLAIN_H = 218;
const KEYS = ['training', 'food', 'sleep'] as const;
const EASE = Easing.bezier(0.2, 0.75, 0.2, 1);

function Bar({ p, color, bg, reduceMotion }: { p: HeroPillar; color: string; bg: string; reduceMotion: boolean }) {
  const to = p.rest ? 0 : Math.min(1, p.value), v = useSharedValue(reduceMotion ? to : 0);
  useEffect(() => { v.value = reduceMotion ? to : withTiming(to, { duration: 620, easing: EASE }); }, [to, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  const fill = useAnimatedStyle(() => ({ width: `${v.value * 100}%` }));
  return <View style={{ height: 3, marginTop: 11, borderRadius: 2, backgroundColor: alpha(color, 0.16) }}>
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2, backgroundColor: color }, fill]} />
    {p.met && !p.rest ? <View style={{ position: 'absolute', right: -3, top: -2, width: 7, height: 7, borderRadius: 3.5, backgroundColor: color, borderWidth: 2, borderColor: bg, boxSizing: 'content-box' }} /> : null}
  </View>;
}

export function PlainHero({ view, colors, reduceMotion }: { view: HeroView; colors: Record<string, string>; reduceMotion: boolean }) {
  // The score counts up from 0 when the numbers first show and to each new day's value after; a changed value fades up.
  const pct = useCountTo(view.pct, !reduceMotion, reduceMotion ? view.pct : 0);
  return <View style={{ height: PLAIN_H, marginTop: 2, marginBottom: 6, alignItems: 'center', paddingTop: 16 }} accessible accessibilityRole="summary"
    accessibilityLabel={view.label} testID="home-hero-plain">
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <Svg width={14} height={6}>
        <Defs><LinearGradient id="heroPlainPill" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor={colors.training} /><Stop offset="0.5" stopColor={colors.sleep} /><Stop offset="1" stopColor={colors.food} /></LinearGradient></Defs>
        <Rect width={14} height={6} rx={3} fill="url(#heroPlainPill)" />
      </Svg>
      <KitText weight={600} size={13} lineHeight={1} color="text-muted">{view.caption}</KitText>
    </View>
    {view.empty ? <View style={{ height: 68 }} /> : <KitText weight={700} size={60} lineHeight={1} tracking={-0.045} numeric style={{ marginTop: 8 }}>{String(pct)}</KitText>}
    <View style={{ alignSelf: 'stretch', flexDirection: 'row', gap: 14, marginTop: 26 }}>
      {view.pillars.map((p, i) => <View key={p.key} style={{ flex: 1, minWidth: 0 }}>
        <KitText weight={700} size={11} lineHeight={1} tracking={0.13} color={KEYS[i]} style={capitals}>{p.label}</KitText>
        <FadeUp k={p.arc.map(a => a[0]).join(' ')} animate={!reduceMotion} ms={TEXT_MOTION.value}>
          <KitText weight={700} size={19} lineHeight={1} tracking={-0.02} numeric numberOfLines={1} style={{ marginTop: 8 }}>
            {p.arc.map(([s, kind], j) => kind === 'u' ? <KitText key={j} weight={700} size={11} lineHeight={1} color="text-muted">{` ${s}`}</KitText> : s)}
          </KitText>
        </FadeUp>
        <KitText weight={500} size={11.5} lineHeight={1} color="text-muted" numberOfLines={1} style={{ marginTop: 5 }}>{p.rest ? t('homeHeroRestDay') : `${t('homeHeroOf')}${p.goal}`}</KitText>
        <Bar p={p} color={colors[KEYS[i]]} bg={colors.bg} reduceMotion={reduceMotion} />
      </View>)}
    </View>
  </View>;
}
