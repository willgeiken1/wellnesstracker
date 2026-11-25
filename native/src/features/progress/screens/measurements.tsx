import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { List, ListRow, Sheet, SheetHeader, Stepper, font, useKit } from '@/components/kit';
import { useAuth } from '@/auth/provider';
import { t } from '@/i18n/en';
import { showToast } from '@/features/shell/toast';
import { today as todayKey } from '@/features/onboarding/model';
import { MEASURE_KEYS, finite, type MeasureKey } from '../model';
import { fill, fmt, fromLen, lenS, lenU, lenV } from '../format';
import { saveBodyFat, saveMeasures } from '../local';
import { useProgress } from '../use-progress';
import { measureName } from './body';

/** Where a stepper starts for a measure never taken, in centimetres. Only saved once the person changes it. */
const START_CM: Record<MeasureKey, number> = { chest: 100, waist: 85, hips: 100, neck: 38, arm: 32, thigh: 56 };
const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Measurements: one stepper per tape measure and one for body fat. Save keeps today's tape readings (the last value of a
 * measure counts as today's unless changed); body fat is saved only when changed, so a smart scale's reading is never
 * copied in as a typed one, and a measure never taken is saved only once its stepper moves.
 */
export function MeasurementsSheet() {
  const d = useProgress(), k = useKit(), auth = useAuth(), repo = auth.repository, u = d.unit, cm = u !== 'lb';
  const lastCm = (key: MeasureKey) => { for (let i = d.measures.length - 1; i >= 0; i--) { const v = d.measures[i].cm[key]; if (finite(v)) return v; } return null; };
  const fat = d.bodyFat.length ? d.bodyFat[d.bodyFat.length - 1] : null;
  const [vals, setVals] = useState<Record<MeasureKey, number>>(() => Object.fromEntries(MEASURE_KEYS.map(key => [key, r1(lenV(lastCm(key) ?? START_CM[key], u))])) as Record<MeasureKey, number>);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [bf, setBf] = useState(fat ? r1(fat.pct) : 20);
  const touch = (key: string) => setTouched(prev => prev.has(key) ? prev : new Set(prev).add(key));
  const save = () => {
    if (!repo) return;
    const out: Partial<Record<MeasureKey, number>> = {};
    for (const key of MEASURE_KEYS) if (touched.has(key) || lastCm(key) != null) out[key] = fromLen(vals[key], u);
    try {
      if (Object.keys(out).length) saveMeasures(repo, todayKey(), out);
      if (touched.has('bf')) saveBodyFat(repo, todayKey(), bf);
    } catch { showToast(t('progressMeasureSaveFailed'), { color: 'warning' }); return; }
    router.back();
    showToast(t('progressMeasuresSaved'), { color: 'recovery' });
  };
  const L = lenU(u);
  return <Sheet header={<SheetHeader title={t('progressMeasurements')} right={t('progressSave')} onRight={save} rightDisabled={!repo} testID="measurements" />}>
    <Text style={[font(500, 14, 1.45), { color: k.c['text-muted'], marginBottom: 4 }]}>{t('progressMeasureLead')}</Text>
    <List><ListRow title={t('progressDate')} value={t('progressTodayCap')} strong /></List>
    <List footer={t('progressMeasureFoot')}>
      {MEASURE_KEYS.map(key => { const last = lastCm(key);
        return <ListRow key={key} title={measureName(key)} sub={last != null ? fill(t('progressLastV'), { v: lenS(last, u) }) : t('progressNotMeasured')}
          right={<Stepper label={measureName(key)} value={vals[key]} unit={L} step={0.5} dec={1} min={cm ? 13 : 5} max={cm ? 203 : 80}
            onChange={v => { touch(key); setVals(prev => ({ ...prev, [key]: v })); }} testID={`measure-${key}`} />} />; })}
      <ListRow title={t('progressBodyFat')} sub={fat ? fill(t(fat.health ? 'progressLastFatScale' : 'progressLastV'), { v: `${fmt(fat.pct, 1)}%` }) : t('progressNotMeasured')}
        right={<Stepper label={t('progressBodyFat')} value={bf} unit="%" step={0.1} dec={1} min={3} max={60} onChange={v => { touch('bf'); setBf(v); }} testID="measure-bf" />} />
    </List>
  </Sheet>;
}
