import { useEffect, useState } from 'react';
import { AppState, PanResponder, Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { WorkoutStore } from '@/data/workout/store';
import { remainingSeconds } from '@/core/workout/rules';
import { useTheme } from '@/design/theme-provider';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { t } from '@/i18n/en';
import { clock, layout, Sheet } from './primitives';
import { restBuzz } from './haptics';
function contour(radius: number, fraction = 1) {
  const points = Array.from({
    length: Math.ceil(120 * fraction) + 1
  }, (_, i) => {
    const a = -Math.PI / 2 + Math.min(i / 120, fraction) * Math.PI * 2,
      r = radius * (1 + .055 * Math.sin(a * 3 + .8) + .025 * Math.cos(a * 5));
    return `${i ? 'L' : 'M'}${150 + r * Math.cos(a)},${150 + r * Math.sin(a)}`;
  });
  return points.join(' ');
}
export function RestContours({
  seconds,
  duration,
  style
}: {
  seconds: number;
  duration: number;
  style: 'unwind' | 'converge';
}) {
  const {
    colors
  } = useTheme();
  const blocks = Math.max(1, Math.ceil(duration / 15)),
    remaining = Math.max(0, seconds / 15),
    visible = Math.ceil(remaining);
  return <Svg accessible={false} width="100%" height="100%" viewBox="0 0 300 300">
    <Path d={contour(138)} fill="none" stroke={colors['surface-2']} strokeWidth={2} />
    {Array.from({
      length: Math.min(visible, 40)
    }, (_, i) => {
      const fraction = i === visible - 1 ? remaining - i : 1;
      const radius = style === 'converge' ? 10 + (i + fraction) / blocks * 125 : 36 + i / Math.max(1, blocks - 1) * 102;
      return <Path key={i} d={contour(radius, style === 'unwind' ? fraction : 1)} fill="none" stroke={colors.accent} opacity={.4 + .6 * (i + 1) / Math.max(1, visible)} strokeWidth={i === visible - 1 ? 2.6 : 1.6} strokeLinecap="round" />;
    })}
    {seconds <= 0 && <Circle cx={150} cy={150} r={5} fill={colors.accent} />}
  </Svg>;
}
export function RestTimer({
  store,
  hidden = false
}: {
  store: WorkoutStore;
  hidden?: boolean;
}) {
  const {
      reduceMotion,
      colors
    } = useTheme(),
    [now, setNow] = useState(() => Date.now()),
    timer = store.timer();
  const endAt = timer?.endAt,
    ended = timer?.ended;
  useEffect(() => {
    if (endAt === undefined || ended) return;
    const update = () => {
      if (AppState.currentState !== 'active') return;
      const stamp = Date.now();
      setNow(stamp);
      const latest = store.timer();
      if (latest && !latest.ended && latest.endAt <= stamp) {
        store.updateTimer({
          ended: true,
          minimized: true
        });
        restBuzz(store.repo);
      }
    };
    const interval = setInterval(update, reduceMotion ? 1000 : 50),
      subscription = AppState.addEventListener('change', state => {
        if (state === 'active') update();
      });
    update();
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [store, endAt, ended, reduceMotion]);
  if (!timer || hidden) return null;
  const seconds = Math.min(timer.duration, remainingSeconds(timer.endAt, now)),
    style = store.repo.localGet<'unwind' | 'converge'>('restStyle') ?? 'unwind';
  const entry = store.repo.get('entries', timer.entryId),
    drafts = store.drafts(timer.entryId),
    next = drafts.findIndex(d => !d.setId);
  if (timer.minimized) return <View style={[layout.row, {
    padding: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.accent
  }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={t('expandRest')} onPress={() => store.updateTimer({
      minimized: false
    })} style={[layout.cell, {
      flex: 1
    }]}><ThemedText numeric>{timer.ended ? t('restReady') : `${t('rest')} · ${clock(seconds)}`}</ThemedText></Pressable>
    <Button label={t('plus15')} variant="secondary" onPress={() => store.adjustTimer(15)} /><Button label={t('skip')} variant="secondary" onPress={() => store.skipTimer()} />
  </View>;
  return <Sheet label={t('rest')} onClose={() => store.updateTimer({
    minimized: true
  })}>
    <TimerDrag onMinimize={() => store.updateTimer({
      minimized: true
    })} />
    <ThemedText style={{
      textAlign: 'center'
    }}>{t('next')}: {String(entry?.data.exercise ?? '')} · {t('set')} {next >= 0 ? next + 1 : drafts.length + 1}</ThemedText>
    <View style={{
      height: 300,
      alignItems: 'center',
      justifyContent: 'center'
    }}><RestContours seconds={reduceMotion ? seconds : Math.min(timer.duration, Math.max(0, (timer.endAt - now) / 1000))} duration={timer.duration} style={style} /><View pointerEvents="none" style={{
        position: 'absolute',
        alignItems: 'center'
      }}><ThemedText numeric variant="display">{clock(seconds)}</ThemedText><ThemedText muted>{t('of')} {clock(timer.duration)}</ThemedText></View></View>
    <ThemedText muted variant="caption" style={{
      textAlign: 'center'
    }}>{t('restExplanation')}</ThemedText>
    <View style={layout.row}>{[-15, 15].map(delta => <View key={delta} style={{
        flex: 1
      }}><Button label={delta > 0 ? t('plus15') : t('minus15')} variant="secondary" onPress={() => store.adjustTimer(delta)} /></View>)}<View style={{
        flex: 1
      }}><Button label={t('skip')} variant="secondary" onPress={() => store.skipTimer()} /></View></View>
    <Button label={t('minimizeRest')} variant="secondary" onPress={() => store.updateTimer({
      minimized: true
    })} />
  </Sheet>;
}
function TimerDrag({
  onMinimize
}: {
  onMinimize: () => void;
}) {
  const {
    colors
  } = useTheme();
  const responder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderRelease: (_, g) => {
      if (g.dy > 35) onMinimize();
    }
  });
  return <View {...responder.panHandlers} style={{
    height: 44,
    alignItems: 'center',
    justifyContent: 'center'
  }}><View style={{
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors['text-muted']
    }} /></View>;
}
