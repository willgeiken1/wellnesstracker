import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { KitText } from '@/components/themed-text';
import { SurfaceContext, capitals, font, mix, tabular, useKit } from '@/components/kit-style';
import { SheetHeader } from '@/components/sheet';
import { Tappable } from '@/components/tappable';
import type { TimerState, WorkoutStore } from '@/data/workout/store';
import { clock } from '../training-data';
import { tr } from '../tr';
import { useWorkout } from '../use-workout';
import { exLabel } from '../logger/model';
import { useRest } from '../logger/chrome';

const PRESETS = [60, 90, 120, 150, 180];
const SIZE = 232, STROKE = 14, R = (SIZE - STROKE) / 2, C = 2 * Math.PI * R;

/** Start a rest by hand, outside a checked-off set. */
export function startRest(store: WorkoutStore, seconds: number, entryId = '', now = Date.now()) {
  const sessionId = store.active()?.id ?? '';
  store.repo.localSave('timer', { sessionId, setId: `rest:${now}`, entryId, endAt: now + seconds * 1000, duration: seconds, minimized: true, ended: false } satisfies TimerState);
}

/** The rest timer sheet (`rest-timer`): a ring with the time, Start or Skip, and the rest length for this exercise. */
export function RestTimerSheet({ entry }: { entry?: string }) {
  const { store } = useWorkout();
  return store ? <RestBody store={store} entry={entry} /> : null;
}
function RestBody({ store, entry }: { store: WorkoutStore; entry?: string }) {
  const k = useKit(), train = k.c.training;
  const active = store.active(), rest = useRest(store, active?.id ?? '');
  const next = active ? store.nextSet(active.id) : undefined;
  const entryId = entry || store.timer()?.entryId || next?.entryId || '';
  const row = entryId ? store.repo.get('entries', entryId) : undefined, name = row ? String(row.data.exercise) : '';
  const [picked, setPicked] = useState<number | null>(null);
  const dflt = name ? store.rest(name).seconds : picked ?? store.rest('').seconds;
  const presets = PRESETS.includes(dflt) ? PRESETS : [...PRESETS, dflt].sort((a, b) => a - b);
  const [, force] = useState(0);
  useEffect(() => { if (!rest) return; const id = setInterval(() => force(n => n + 1), 250); return () => clearInterval(id); }, [rest]);
  const on = !!rest && !rest.done, f = on ? rest.left / rest.total : 1;
  const pick = (v: number) => {
    if (name) store.setRest(name, { ...store.rest(name), seconds: v }); else setPicked(v);
    if (on) startRest(store, v, entryId);
  };
  const round = (label: string, spoken: string, run: () => void) => <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={spoken} onPress={run}
    style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: k.dark ? k.c['surface-2'] : k.c.surface, boxShadow: k.cardEdge }}>
    <KitText weight={700} size={16} numeric>{label}</KitText>
  </Tappable>;
  const label = exLabel(name);
  const nextLine = on ? (next && row ? tr('trainingRestNext', { name: label }) : '') : name ? tr('trainingDefaultRestFor', { name: label }) : tr('trainingPickLength');
  return <SurfaceContext.Provider value="sheet"><View style={{ flex: 1, backgroundColor: k.sheetBg, paddingHorizontal: 16 }}>
    <SheetHeader title={tr('trainingRestTimer')} left={tr('trainingClose')} />
    <View style={{ alignItems: 'center', paddingTop: 8 }}>
      <View accessible accessibilityRole="timer" accessibilityLabel={`${tr('trainingRestLeft')}: ${on ? clock(Math.ceil(rest!.left) * 1000) : clock(dflt * 1000)}`} style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={mix(train, k.c['surface-2'], 0.16)} strokeWidth={STROKE} />
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={train} strokeWidth={STROKE} strokeLinecap="round" strokeDasharray={`${C} ${C}`} strokeDashoffset={C * (1 - f)} />
        </Svg>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[font(700, 60, 1, -0.05), tabular, { color: k.c.text }]}>{on ? clock(Math.ceil(rest!.left) * 1000) : clock(dflt * 1000)}</Text>
          <KitText weight={600} size={14} color="text-muted" style={{ marginTop: 6 }}>{on ? tr('trainingOfTime', { time: clock(rest!.total * 1000) }) : tr('trainingReady')}</KitText>
        </View>
      </View>
      <KitText weight={600} size={14} color="text-muted" style={{ marginTop: 14, minHeight: 20, textAlign: 'center' }}>{nextLine}</KitText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 18, marginBottom: 6 }}>
        {on ? <>
          {round('−15', tr('trainingLess15'), () => { if (rest!.left <= 15) store.skipTimer(); else store.adjustTimer(-15); })}
          <Button label={tr('trainingSkipRest')} color="training" icon="tr-skip" onPress={() => store.skipTimer()} />
          {round('+15', tr('trainingMore15'), () => store.adjustTimer(15))}
        </> : <Button label={tr('trainingStartRest')} color="training" icon="play" onPress={() => startRest(store, dflt, entryId)} />}
      </View>
      <Text style={[font(700, 10.5, 1, 0.14), capitals, { color: k.c['text-muted'], marginTop: 18 }]}>{name ? tr('trainingRestForName', { name: label }) : tr('trainingLength')}</Text>
      <View accessibilityLabel={tr('trainingRestLength')} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 8 }}>
        {presets.map(p => <Chip key={p} label={clock(p * 1000)} accessibilityLabel={tr('trainingRestChip', { time: clock(p * 1000) })} selected={p === (on ? rest!.total : dflt)} color="training" onPress={() => pick(p)} />)}
      </View>
      <KitText weight={500} size={12.5} lineHeight={1.45} color="text-muted" style={{ textAlign: 'center', marginTop: 18, marginHorizontal: 8 }}>{tr('trainingRestFoot')}</KitText>
    </View>
  </View></SurfaceContext.Provider>;
}
