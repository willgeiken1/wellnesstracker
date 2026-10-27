import { useState } from 'react';
import { View, TextInput, ScrollView } from 'react-native';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import type { WorkoutStore } from '@/data/workout/store';
import { fromKg, rounded, toKg, type Unit } from '@/core/workout/rules';
import { t } from '@/i18n/en';
import { Sheet, layout } from './primitives';
export function MachineSetup({ store, name }: { store: WorkoutStore; name: string }) {
  const [open, setOpen] = useState(false);
  const note = store.preferences().machine(name);
  return <>{!!note.text && <ThemedText muted variant="caption">{note.text}</ThemedText>}<Button label={t('machineSetup')} variant="secondary" onPress={() => setOpen(true)} />
    {open && <SetupEditor store={store} name={name} onClose={() => setOpen(false)} />}</>;
}
function SetupEditor({ store, name, onClose }: { store: WorkoutStore; name: string; onClose: () => void }) {
  const note = store.preferences().machine(name);
  const [text, setText] = useState(note.text), [step, setStep] = useState(note.step === undefined ? '' : String(note.step)),
    [bar, setBar] = useState(note.bar_weight === undefined ? '' : String(note.bar_weight)),
    [override, setOverride] = useState<Unit | undefined>(note.unit_override), [error, setError] = useState(false);
  const unit = override ?? store.unit(), { colors } = useTheme();
  const inputStyle = [layout.input, { color: colors.text, backgroundColor: colors['surface-2'] }];
  function changeUnit(next: Unit | undefined) {
    const nextUnit = next ?? store.unit();
    const convert = (value: string) => /^\d+(?:\.\d{1,2})?$/.test(value.trim()) && Number.isFinite(Number(value))
      ? String(rounded(fromKg(toKg(Number(value), unit), nextUnit))) : '';
    setStep(convert(step));
    setBar(convert(bar));
    setOverride(next);
  }
  return <Sheet expanded label={`${name} · ${t('machineSetup')}`} onClose={onClose}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={layout.stack}>
    <ThemedText>{t('machineNotes')}</ThemedText>
    <TextInput accessibilityLabel={t('machineNotes')} multiline value={text} onChangeText={setText} style={inputStyle} />
    <ThemedText>{t('setupStep').replace('{unit}', unit)}</ThemedText>
    <TextInput accessibilityLabel={t('setupStep').replace('{unit}', unit)} keyboardType="decimal-pad" value={step} placeholder={unit === 'lb' ? '10' : '5'} placeholderTextColor={colors['text-muted']} onChangeText={setStep} style={inputStyle} />
    <ThemedText>{t('barWeight').replace('{unit}', unit)}</ThemedText>
    <TextInput accessibilityLabel={t('barWeight').replace('{unit}', unit)} keyboardType="decimal-pad" value={bar} placeholder={unit === 'lb' ? '45' : '20'} placeholderTextColor={colors['text-muted']} onChangeText={setBar} style={inputStyle} />
    <View style={[layout.row, { flexWrap: 'wrap' }]}>
      <Button label={t('defaultUnit')} selected={!override} variant="secondary" onPress={() => changeUnit(undefined)} />
      {(['lb', 'kg'] as const).map(u => <Button key={u} label={t('exerciseUnit').replace('{unit}', u)} selected={override === u} variant="secondary" onPress={() => changeUnit(u)} />)}
    </View>
    {error && <ThemedText accessibilityRole="alert">{t('invalidSetup')}</ThemedText>}
    <Button label={t('saveSetup')} onPress={() => {
      try {
        const numeric = /^\d+(?:\.\d{1,2})?$/;
        if ((step.trim() && !numeric.test(step.trim())) || (bar.trim() && !numeric.test(bar.trim()))) throw Error();
        store.preferences().saveMachine(name, { text, step: step.trim() ? Number(step) : undefined, bar_weight: bar.trim() ? Number(bar) : undefined, unit_override: override }, store.unit());
        onClose();
      } catch { setError(true); }
    }} />
  </ScrollView></Sheet>;
}
