import { useState } from 'react';
import { View } from 'react-native';
import { ThemedText } from '../../components/themed-text';
import { tokens } from '../../design/tokens';
import { t } from '../../i18n/en';
import { today } from '../onboarding/model';
import { portion, type Food } from './model';
import { dayInSentence, FieldRow, Group, GroupLabel, NoticeRow, PanelHeader, PrimaryAction } from './parts';

const keys = ['name', 'energy_kj', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg', 'amount_g'] as const;
type Key = typeof keys[number];
/** Spoken label (with the unit), short visible name and unit for each field. */
const FIELD = {
  name: ['foodName', 'foodFieldName', null],
  energy_kj: ['foodCalories', 'foodFieldCalories', 'foodUnitKcal'],
  protein_g: ['foodProtein', 'foodMacroProtein', 'foodUnitG'],
  carbs_g: ['foodCarbs', 'foodMacroCarbs', 'foodUnitG'],
  fat_g: ['foodFat', 'foodMacroFat', 'foodUnitG'],
  fiber_g: ['foodFiber', 'foodFieldFiber', 'foodUnitG'],
  sugar_g: ['foodSugar', 'foodFieldSugar', 'foodUnitG'],
  sodium_mg: ['foodSodium', 'foodFieldSodium', 'foodUnitMg'],
  amount_g: ['foodAmount', 'foodFieldAmount', 'foodUnitG'],
} as const;
const GROUPS = [
  { title: 'foodGroupEnergy', keys: ['energy_kj', 'protein_g', 'carbs_g', 'fat_g'] },
  { title: 'foodGroupMore', keys: ['fiber_g', 'sugar_g', 'sodium_mg'] },
] as const;
const number = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * The food form. A blank number stays unknown (saved as null), never zero.
 * `editing` only changes the heading; saving is the caller's `onSave`.
 */
export function FoodEntry({ initial, day, onSave, onClose, editing = false }: { initial?: Food; day: string; onSave: (food: Food, multiple: number) => void; onClose: () => void; editing?: boolean }) {
  const [values, setValues] = useState(() => Object.fromEntries(keys.map(k => [k, initial?.[k] == null ? '' : k === 'energy_kj' ? String(Math.round(Number(initial[k]) / 4.184 * 1000000) / 1000000) : String(initial[k])])));
  const [multiple, setMultiple] = useState('1'), [error, setError] = useState<'foodInvalid' | 'foodFailure' | null>(null);
  // Which fields to point at after a rejected save. A field is cleared as soon as it is edited.
  const [flagged, setFlagged] = useState<ReadonlySet<string>>(new Set());
  const unflag = (key: string) => { if (flagged.has(key)) setFlagged(new Set([...flagged].filter(k => k !== key))); };
  const problems = () => {
    const bad = new Set<string>();
    if (!values.name.trim()) bad.add('name');
    for (const key of keys) if (key !== 'name' && values[key].trim() !== '' && !number.test(values[key].trim())) bad.add(key);
    if (!number.test(multiple.trim()) || !(Number(multiple) > 0)) bad.add('multiple');
    return bad;
  };
  const save = () => {
    let food: Food; let count: number;
    try {
      const numeric = [...keys.filter(k => k !== 'name').map(k => values[k]), multiple];
      if (numeric.some(v => v.trim() !== '' && !number.test(v.trim()))) throw new Error();
      count = Number(multiple); food = { ...initial, name: values.name, ...Object.fromEntries(keys.filter(k => k !== 'name').map(k => [k, values[k].trim() === '' ? null : Number(values[k]) * (k === 'energy_kj' ? 4.184 : 1)])) };
      portion(food, count);
    } catch { setFlagged(problems()); setError('foodInvalid'); return; }
    setFlagged(new Set());
    try { onSave(food, count); } catch { setError('foodFailure'); }
  };
  const field = (key: Key, first: boolean) => {
    const [label, title, unit] = FIELD[key];
    return <FieldRow key={key} first={first} label={t(label)} title={t(title)} unit={unit ? t(unit) : undefined} numeric={key !== 'name'}
      placeholder={t(key === 'name' ? 'foodNamePlaceholder' : key === 'amount_g' ? 'foodValueOptional' : 'foodValueUnknown')} value={values[key]}
      problem={flagged.has(key) ? t(key === 'name' ? 'foodProblemName' : 'foodProblemNumber') : undefined}
      onChange={value => { setValues({ ...values, [key]: value }); unflag(key); }} />;
  };
  return <View style={{ gap: tokens.spacing[2] }} testID="food-entry">
    <PanelHeader title={t(editing ? 'foodEntryEdit' : initial && keys.some(k => k !== 'name' && initial[k] != null) ? 'foodEntryDetails' : 'foodEntryAdd')} action={{ label: t('cancel'), onPress: onClose }} />
    <Group>
      {field('name', true)}
      {field('amount_g', false)}
      <FieldRow label={t('foodPortions')} title={t('foodFieldPortions')} unit={t('foodUnitTimes')} numeric value={multiple}
        problem={flagged.has('multiple') ? t('foodProblemPortions') : undefined} onChange={value => { setMultiple(value); unflag('multiple'); }} />
    </Group>
    {GROUPS.map(group => <View key={group.title} style={{ gap: 6 }}>
      <GroupLabel>{t(group.title)}</GroupLabel>
      <Group>{group.keys.map((key, index) => field(key, index === 0))}</Group>
    </View>)}
    <ThemedText muted variant="caption">{t('foodBlankHint')}</ThemedText>
    {error && <NoticeRow alert text={t(error)} action={error === 'foodFailure' ? { label: t('foodRetry'), onPress: save } : undefined} />}
    <PrimaryAction testID="food-entry-save" label={t('foodSaveDay').replace('{day}', dayInSentence(day, today()))} onPress={save} />
  </View>;
}
