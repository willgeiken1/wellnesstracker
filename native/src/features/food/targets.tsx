import { useState } from 'react';
import { View } from 'react-native';
import { ThemedText } from '../../components/themed-text';
import { useTheme } from '../../design/theme-provider';
import { tokens } from '../../design/tokens';
import type { Repository } from '../../data/repository';
import { t } from '../../i18n/en';
import { RING_PILLAR } from './ring';
import { foodTargets, setTargets, resetFoodTargets } from './model';
import { FieldRow, Group, NoticeRow, PanelHeader, PrimaryAction, QuietAction, semibold, SoftAction } from './parts';

/** Spoken label, short name, unit and the ring colour each target shares with the calorie ring. */
const ROWS = [
  ['foodTargetCalories', 'foodFieldCalories', 'foodUnitKcal', RING_PILLAR.energy_kj, 'energy_kj'],
  ['foodTargetProtein', 'foodMacroProtein', 'foodUnitG', RING_PILLAR.protein_g, 'protein_g'],
  ['foodTargetCarbs', 'foodMacroCarbs', 'foodUnitG', RING_PILLAR.carbs_g, 'carbs_g'],
  ['foodTargetFat', 'foodMacroFat', 'foodUnitG', RING_PILLAR.fat_g, 'fat_g'],
] as const;
const ACTIVITY = { sitting: 'activitySitting', light: 'activityLight', active: 'activityActive', very: 'activityVery' } as const;

export function FoodTargets({ repo, day, revision }: { repo: Repository; day: string; revision: number }) {
  'use no memo';
  // The revision prop invalidates the parent's child element after local writes.
  void revision;
  const { colors } = useTheme();
  const current = foodTargets(repo, day), [editing, setEditing] = useState(false), [values, setValues] = useState(['', '', '', '']), [error, setError] = useState(false);
  const target = current.targets;
  const shown = target ? [Math.round(target.energy_kj / 4.184), target.protein_g, target.carbs_g, target.fat_g] : null;
  const heading = target ? t(current.basis === 'manual' ? 'foodTargetsManual' : 'estimatedTargets') : t('foodTargetsTitle');
  const open = () => { setValues(shown ? shown.map(String) : ['', '', '', '']); setEditing(true); setError(false); };
  if (editing) return <View style={{ gap: tokens.spacing[2] }} testID="food-targets-edit">
    <PanelHeader title={t(target ? 'foodTargetsEdit' : 'foodTargetsSet')} action={{ label: t('cancel'), onPress: () => setEditing(false) }} />
    <Group>
      {ROWS.map(([label, title, unit], i) => <FieldRow key={label} first={i === 0} label={t(label)} title={t(title)} unit={t(unit)} numeric
        placeholder={t('foodValueNotSet')} value={values[i]} onChange={value => { setValues(values.map((v, n) => n === i ? value : v)); setError(false); }} />)}
    </Group>
    {error && <NoticeRow alert text={t('invalidTargets')} />}
    <PrimaryAction label={t('foodTargetsSave')} onPress={() => { try { if (values.some(v => !v.trim() || !Number.isFinite(Number(v)))) throw new Error(); setTargets(repo, day, { energy_kj: Number(values[0]) * 4.184, protein_g: Number(values[1]), carbs_g: Number(values[2]), fat_g: Number(values[3]) }); setEditing(false); } catch { setError(true); } }} />
    <SoftAction label={t('foodTargetsAuto')} onPress={() => { try { resetFoodTargets(repo, day); setEditing(false); } catch { setError(true); } }} />
    <ThemedText muted variant="caption">{t('foodTargetsAutoHint')}</ThemedText>
  </View>;
  return <View style={{ gap: tokens.spacing[1] }} testID="food-targets">
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacing[1] }}>
      <ThemedText variant="headline" accessibilityRole="header" style={[semibold, { flexGrow: 1, flexShrink: 1 }]}>{heading}</ThemedText>
      {target && <QuietAction label={t('foodTargetsEdit')} onPress={open} />}
    </View>
    {shown
      ? <View accessible accessibilityLabel={t('foodTargetSummary').replace('{calories}', String(shown[0])).replace('{protein}', String(shown[1])).replace('{carbs}', String(shown[2])).replace('{fat}', String(shown[3]))}
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {ROWS.map(([, title, unit, pillar, key], i) => <View key={title} style={{ flexGrow: 1, flexBasis: '45%', borderRadius: 14, backgroundColor: colors['surface-2'], paddingHorizontal: 10, paddingVertical: 10, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View testID={`food-target-dot-${key}`} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors[pillar] }} />
              <ThemedText muted variant="caption" style={[semibold, { flexShrink: 1 }]}>{t(title)}</ThemedText>
            </View>
            <ThemedText numeric style={{ fontSize: 19, lineHeight: 24, fontWeight: '600' }}>{Math.round(shown[i]).toLocaleString('en-US')}
              <ThemedText muted variant="caption">{' '}{t(unit)}</ThemedText></ThemedText>
          </View>)}
        </View>
      : <ThemedText muted>{t('targetsUnset')}</ThemedText>}
    {current.basis === 'estimated' && <ThemedText muted variant="caption">{t('foodActivityEstimate').replace('{level}', t(ACTIVITY[current.activity] ?? 'activityLight'))}</ThemedText>}
    {!target && <SoftAction label={t('foodTargetsSet')} onPress={open} />}
  </View>;
}
