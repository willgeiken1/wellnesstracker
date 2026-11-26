import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Badge } from '@/components/badge';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { KitText } from '@/components/themed-text';
import { SurfaceContext, alpha, capitals, font, useKit } from '@/components/kit-style';
import { SheetHeader } from '@/components/sheet';
import { SearchField } from '@/components/text-field';
import { Tappable } from '@/components/tappable';
import type { Exercise } from '@/core/workout/library';
import { filterExercises } from '@/core/workout/exercise-rules';
import { showToast } from '@/features/shell/toast';
import { MUSCLE_GROUPS, equipmentName, muscleGroup, type MuscleGroup } from '../training-data';
import { tr } from '../tr';
import { useWorkout } from '../use-workout';
import { exLabel } from '../logger/model';
import { trainingRoutes } from '../nav';

export type PickerMode = 'add' | 'replace' | 'routine' | 'browse';
const groupsOf = (e: Exercise) => [e.main, ...e.helpers].map(m => muscleGroup(m)).filter(Boolean) as MuscleGroup[];

/** The exercise picker sheet (`exercise-picker`): search, muscle chips, Recent and every exercise; tick several to add. */
export function ExercisePickerSheet({ mode = 'add', entry, routine }: { mode?: PickerMode; entry?: string; routine?: string }) {
  const k = useKit(), { store } = useWorkout();
  const [q, setQ] = useState(''), [muscle, setMuscle] = useState<MuscleGroup | 'All'>('All'), [sel, setSel] = useState<string[]>([]);
  const single = mode === 'replace' || mode === 'browse';
  const library = useMemo(() => store?.preferences().library() ?? [], [store]);
  const active = store?.active();
  const inNow = new Set(mode === 'routine' && routine && store ? store.templateExercises(routine).map(e => String(e.data.exercise))
    : mode === 'add' && active && store ? store.entries(active.id).map(e => String(e.data.exercise)) : []);
  const recentNames = [...new Set(store?.preferences().recent() ?? [])].slice(0, 6);
  const byName = new Map(library.map(e => [e.name.toLowerCase(), e]));
  const recent = recentNames.map(n => byName.get(n.toLowerCase()) ?? { name: n, helpers: [], equipment: 'other' as const });
  const names = filterExercises(library, q, '', '').filter(e => muscle === 'All' || groupsOf(e).includes(muscle))
    .sort((a, b) => exLabel(a.name).localeCompare(exLabel(b.name)));
  const filtered = !!q.trim() || muscle !== 'All';
  const title = tr(mode === 'replace' ? 'trainingReplace' : mode === 'browse' ? 'trainingExercises' : 'trainingAddExercise');

  const commit = (picked: string[]) => {
    if (!store || !picked.length) return;
    try {
      if (mode === 'browse') { router.back(); router.push({ pathname: trainingRoutes.exercise, params: { name: picked[0] } }); return; }
      if (mode === 'replace' && entry) { store.replaceExercise(entry, picked[0], 'replace'); showToast(tr('trainingReplacedWith', { name: exLabel(picked[0]) }), { color: 'training' }); }
      else if (mode === 'routine' && routine) {
        const row = store.repo.get('routines', routine), current = store.templateExercises(routine);
        store.saveTemplate(String(row?.data.name ?? ''), [...current.map(e => ({ id: e.id, exercise: String(e.data.exercise), target_sets: Number(e.data.target_sets) || 3, target_reps: Number(e.data.target_reps) || 8 })),
          ...picked.map(exercise => ({ exercise, target_sets: 3, target_reps: 10, rep_min: 8, rep_max: 12 }))], routine);
        showToast(tr('trainingAddedTo', { n: picked.length, name: String(row?.data.name ?? '') }), { color: 'training' });
      } else if (active) {
        for (const n of picked) store.addExercise(active.id, n, 3);
        showToast(picked.length === 1 ? tr('trainingAddedOne', { name: exLabel(picked[0]) }) : tr('trainingAddedMany', { n: picked.length }), { color: 'training' });
      }
      router.back();
    } catch { showToast(tr('trainingSaveError'), { color: 'warning' }); }
  };
  const press = (name: string) => single ? commit([name]) : setSel(s => s.includes(name) ? s.filter(x => x !== name) : [...s, name]);
  const cardBg = k.dark ? k.c['surface-2'] : k.c.surface;

  const row = (e: Exercise, i: number, list: string) => {
    const on = sel.includes(e.name), label = exLabel(e.name), group = groupsOf(e)[0];
    const initial = label.charAt(0).toUpperCase();
    return <Tappable key={`${list}-${e.name}`} dim="row" accessibilityRole="button" accessibilityState={single ? undefined : { selected: on }}
      accessibilityLabel={`${label}, ${group ?? tr('trainingOther')}, ${equipmentName(e.equipment)}${inNow.has(e.name) ? `, ${tr('trainingAdded')}` : ''}`}
      onPress={() => press(e.name)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 59, paddingLeft: 16, paddingRight: 16 }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? k.c.training : alpha(k.c.training, 0.14) }}>
        <KitText weight={700} size={14} color={on ? 'on-accent' : 'training'}>{initial}</KitText>
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingVertical: 8, borderTopWidth: 0 }}>
        <KitText weight={600} size={15.5} lineHeight={1.25} tracking={-0.01} color="text" numberOfLines={1}>{label}</KitText>
        <KitText weight={500} size={13} lineHeight={1.35} color="text-muted" numberOfLines={1} style={{ marginTop: 2 }}>{`${group ?? tr('trainingOther')} · ${equipmentName(e.equipment)}`}</KitText>
      </View>
      {inNow.has(e.name) && <View style={{ alignSelf: 'center' }}><Badge label={tr('trainingAdded')} color="training" /></View>}
      {single ? <View style={{ marginHorizontal: -4 }}><Icon name="chevron-right" size={16} color={k.c.ghost} /></View>
        : <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? k.c.training : 'transparent',
          boxShadow: on ? undefined : `inset 0px 0px 0px 2px ${k.c['hair-2']}` }}>{on && <Icon name="check" size={15} color={k.c['on-accent']} />}</View>}
      {i > 0 && <View style={{ position: 'absolute', top: 0, left: 64, right: 0, height: 1, backgroundColor: k.c.hair }} />}
    </Tappable>;
  };
  const list = (items: Exercise[], key: string) => <View style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: cardBg, boxShadow: k.cardEdge }}>{items.map((e, i) => row(e, i, key))}</View>;
  const group = (label: string) => <Text style={[font(700, 11, undefined, 0.12), capitals, { color: k.c['text-muted'], marginTop: 20, marginHorizontal: 4, marginBottom: 8 }]}>{label}</Text>;
  const custom = q.trim().replace(/^./, c => c.toUpperCase());

  return <SurfaceContext.Provider value="sheet"><View style={{ flex: 1, backgroundColor: k.sheetBg }}>
    <View style={{ paddingHorizontal: 16 }}>
      <SheetHeader title={title} right={single ? undefined : sel.length ? tr('trainingAddN', { n: sel.length }) : tr('trainingAddShort')} rightDisabled={!sel.length}
        onRight={() => commit(sel)} />
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <SearchField placeholder={tr('trainingSearchExercises')} value={q} onChangeText={setQ} testID="exercise-picker-search" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 12 }}
        accessibilityLabel={tr('trainingFilterMuscle')}>
        {(['All', ...MUSCLE_GROUPS] as const).map(m => <Chip key={m} label={m === 'All' ? tr('trainingAll') : m} selected={muscle === m} color="training" onPress={() => setMuscle(m)} />)}
      </ScrollView>
      <View style={{ paddingHorizontal: 16 }}>
        {!filtered && recent.length > 0 && <>{group(tr('trainingRecent'))}{list(recent, 'r')}</>}
        {group(filtered ? tr(names.length === 1 ? 'trainingResults_one' : 'trainingResults_other', { n: names.length }) : tr('trainingAllExercises'))}
        {names.length ? list(names, 'a') : custom ? <View style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: cardBg, boxShadow: k.cardEdge }}>
          <Tappable dim="row" accessibilityRole="button" accessibilityLabel={tr('trainingCreate', { name: custom })} onPress={() => commit([custom])}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, paddingHorizontal: 16 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(k.c.training, 0.16) }}><Icon name="plus" size={18} color={k.c.training} /></View>
            <View style={{ flex: 1 }}>
              <KitText weight={600} size={15.5} lineHeight={1.25} tracking={-0.01} color="text">{tr('trainingCreate', { name: custom })}</KitText>
              <KitText weight={500} size={13} lineHeight={1.35} color="text-muted" style={{ marginTop: 2 }}>{tr('trainingCreateSub')}</KitText>
            </View>
          </Tappable>
        </View> : null}
      </View>
    </ScrollView>
  </View></SurfaceContext.Provider>;
}
