import { useMemo, useRef, useState } from 'react';
import { Alert, PanResponder, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Defs, Line, LinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { Icon, List, ListRow, SegmentedControl, Sheet, SheetHeader, font, mix, useKit, useSelectionHaptic , Tappable } from '@/components/kit';
import { useAuth } from '@/auth/provider';
import { t } from '@/i18n/en';
import { showToast } from '@/features/shell/toast';
import { deleteWeighIn, lastWeight, saveWeighIn, unusualWeight } from '@/features/body/model';
import { today as todayKey } from '@/features/onboarding/model';
import { addDays } from '../model';
import { clockAt, fill, fmt, wGoal, wtV } from '../format';
import { readWeightFromHealth, saveWeightFromHealth } from '../local';
import { useProgress } from '../use-progress';

const PX = 9; // one tenth on the ruler
const limits = (unit: 'kg' | 'lb'): [number, number] => unit === 'kg' ? [27, 227] : [60, 500];
const round1 = (v: number) => Math.round(v * 10) / 10;

/** The ruler: a tick every tenth, a long one every whole number, dragged sideways under a fixed green line. */
function Ruler({ v, unit, onChange }: { v: number; unit: 'kg' | 'lb'; onChange: (next: number) => void }) {
  const k = useKit(), [w, setW] = useState(0);
  const start = useRef(v), live = useRef(v);
  live.current = v;
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { start.current = live.current; },
    onPanResponderMove: (_, g) => onChange(start.current - g.dx / (PX * 10)),
  }), [onChange]);
  const ticks = [];
  for (let i = -40; i <= 40; i++) {
    const val = Math.round(v * 10) + i, x = i * PX, major = val % 10 === 0, mid = val % 5 === 0;
    ticks.push(<Line key={`l${val}`} x1={x} x2={x} y1={major ? 10 : mid ? 16 : 20} y2={major ? 34 : 30} stroke={major ? k.c.text : k.c.ghost} strokeWidth={major ? 1.6 : 1} strokeLinecap="round" />);
    if (major) ticks.push(<SvgText key={`t${val}`} x={x} y={48} textAnchor="middle" fontFamily={font(700, 10).fontFamily} fontSize={10} fill={k.c['text-muted']}>{val / 10}</SvgText>);
  }
  const off = (v * 10 - Math.round(v * 10)) * PX, edge = k.sheetBg;
  return <View onLayout={e => setW(e.nativeEvent.layout.width)} {...pan.panHandlers} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
    style={{ width: '100%', height: 56, borderRadius: 14, overflow: 'hidden', backgroundColor: k.cardBg }}>
    <Svg width={720} height={56} viewBox="-360 0 720 56" style={{ position: 'absolute', top: 0, left: w / 2 - 360 - off }}>{ticks}</Svg>
    <View style={{ position: 'absolute', left: '50%', top: 6, bottom: 6, width: 3, marginLeft: -1.5, borderRadius: 2, backgroundColor: k.c.recovery }} />
    {w ? <Svg width={w} height={56} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      <Defs>
        <LinearGradient id="rl" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor={edge} stopOpacity={1} /><Stop offset="1" stopColor={edge} stopOpacity={0} /></LinearGradient>
        <LinearGradient id="rr" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor={edge} stopOpacity={0} /><Stop offset="1" stopColor={edge} stopOpacity={1} /></LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w * 0.22} height={56} fill="url(#rl)" />
      <Rect x={w * 0.78} y={0} width={w * 0.22} height={56} fill="url(#rr)" />
    </Svg> : null}
  </View>;
}

/** A round 56 pt button either side of the ruler. */
const Round = ({ icon, label, onPress }: { icon: 'minus' | 'plus'; label: string; onPress: () => void }) => {
  const k = useKit();
  return <Tappable dim="fill" onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
    style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: k.cardBg, boxShadow: k.cardEdge }}>
    <Icon name={icon} size={22} color={k.c.text} /></Tappable>;
};

/**
 * Log weight: the value on a ruler (drag it, or step a tenth with the round buttons, or tap the number to type), today or
 * yesterday, and Save with Undo. It starts from the last weight typed here, never from an Apple Health reading: a typed
 * weigh-in syncs, and a Health value must not ride along with it.
 */
export function LogWeightSheet() {
  const d = useProgress(), k = useKit(), auth = useAuth(), repo = auth.repository, u = d.unit, haptic = useSelectionHaptic();
  const typedKg = useMemo(() => repo ? lastWeight(repo.list('weigh_ins').filter(r => r.data.source === 'app')) : null, [repo]);
  const startKg = d.demo && d.weight.kg != null ? d.weight.kg : typedKg;
  const [v, setV] = useState(() => round1(startKg != null ? wtV(startKg, u) : u === 'lb' ? 160 : 72));
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const [typing, setTyping] = useState<string | null>(null);
  const [fromHealth, setFromHealth] = useState(() => repo ? readWeightFromHealth(repo) : true);
  const set = (x: number) => { const [lo, hi] = limits(u), n = Math.max(lo, Math.min(hi, round1(x))); if (n !== v) haptic(); setV(n); };
  const goal = d.weight.goalKg != null ? wtV(d.weight.goalKg, u) : null, gap = goal != null ? round1(v - goal) : null;
  const unitWord = t(u === 'kg' ? 'progressKilograms' : 'progressPounds');
  const save = () => {
    if (!repo) return;
    const value = typing != null ? Number(typing) : v;
    if (!Number.isFinite(value) || value <= 0) { showToast(t('progressWeightInvalid'), { color: 'warning' }); return; }
    const dayKey = day === 'today' ? todayKey() : addDays(todayKey(), -1);
    const go = () => {
      let id: string | null = null;
      try { id = saveWeighIn(repo, value, u, dayKey).id; } catch { showToast(t('progressWeightSaveFailed'), { color: 'warning' }); return; }
      router.back();
      showToast(fill(t('progressWeightSaved'), { v: `${fmt(value, 1)} ${u}` }), { color: 'recovery', action: { label: t('progressUndo'), onAction: () => { if (id) deleteWeighIn(repo, id); } } });
    };
    if (unusualWeight(value, u, typedKg)) Alert.alert(t('progressWeightUnusual'), undefined, [{ text: t('cancel'), style: 'cancel' }, { text: t('progressSaveAnyway'), onPress: go }]);
    else go();
  };
  return <Sheet scroll={false} header={<SheetHeader title={t('progressLogWeight')} right={t('progressSave')} onRight={save} rightDisabled={!repo} testID="log-weight" />}>
    <View style={{ alignItems: 'center', paddingTop: 18, paddingBottom: 8 }}>
      {typing != null
        ? <TextInput autoFocus value={typing} onChangeText={setTyping} keyboardType="decimal-pad" accessibilityLabel={fill(t('progressWeightIn'), { unit: unitWord })}
            onBlur={() => { const n = Number(typing); if (Number.isFinite(n) && n > 0) set(n); setTyping(null); }}
            style={[font(700, 72, 1, -0.05), { color: k.c.text, textAlign: 'center', minWidth: 200, fontVariant: ['tabular-nums'] }]} />
        : <Tappable dim="row" onPress={() => setTyping(fmt(v, 1).replace(/,/g, ''))} accessibilityRole="button" accessibilityHint={t('progressTapToType')} accessibilityLabel={`${fmt(v, 1)} ${unitWord}`}>
            <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={[font(700, 72, 1, -0.05), { color: k.c.text, fontVariant: ['tabular-nums'] }]}>{fmt(v, 1)}</Text>
              <Text style={[font(600, 22), { color: k.c['text-muted'], marginLeft: 6 }]}>{u}</Text></View>
          </Tappable>}
      {goal != null && gap != null ? <Text style={[font(600, 13.5), { marginTop: 8, color: k.c['text-muted'] }]}>
        {gap > 0 ? fill(t('progressToGoalOf'), { v: `${fmt(gap, 1)} ${u}`, goal: wGoal(d.weight.goalKg!, u) }) : fill(t('progressAtGoalOf'), { goal: wGoal(d.weight.goalKg!, u) })}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 18, alignSelf: 'stretch' }}>
        <Round icon="minus" label={fill(t('progressDecreaseBy'), { u })} onPress={() => set(v - 0.1)} />
        <View style={{ flex: 1 }} accessible accessibilityRole="adjustable" accessibilityLabel={t('progressWeightDrag')} accessibilityValue={{ text: `${fmt(v, 1)} ${unitWord}` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={e => set(v + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1))}>
          <Ruler v={v} unit={u} onChange={set} /></View>
        <Round icon="plus" label={fill(t('progressIncreaseBy'), { u })} onPress={() => set(v + 0.1)} />
      </View>
    </View>
    <View style={{ height: 4 }} />
    <List footer={t('progressReadsHealth')}>
      <ListRow title={t('progressDate')} right={<View style={{ width: 184 }}><SegmentedControl compact label={t('progressDate')} value={day} onChange={x => {
        setDay(x); if (x === 'today' && startKg != null) setV(round1(wtV(startKg, u)));
      }} options={[{ value: 'today', label: t('progressTodayCap') }, { value: 'yesterday', label: t('progressYesterday') }]} /></View>} />
      {day === 'today' ? <ListRow title={t('progressTime')} value={clockAt(Date.now())} /> : null}
      <ListRow icon="apple" color="recovery" title={t('progressFromHealth')} sub={t('progressFromHealthSub')} toggle={fromHealth}
        onToggle={on => { setFromHealth(on); if (repo) saveWeightFromHealth(repo, on); }} />
    </List>
  </Sheet>;
}
