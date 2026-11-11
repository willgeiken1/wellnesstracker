import { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { tokens } from '@/design/tokens';
import type { WorkoutStore } from '@/data/workout/store';
import { fromKg, rounded, toKg, type Equipment, type Unit } from '@/core/workout/rules';
import { t } from '@/i18n/en';
import { Chip, Sheet, layout } from './primitives';
import { Field, Pick, Primary, Trouble, semibold } from './parts';
/** The same editor serves every lift; only machines and cables call it "Machine setup". */
function setupLabel(equipment?: Equipment) { return t(!equipment || equipment === 'machine' || equipment === 'cable' ? 'machineSetup' : 'barStepSetup'); }
export function MachineSetup({ store, name, equipment, compact }: { store: WorkoutStore; name: string; equipment?: Equipment; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const note = store.preferences().machine(name);
  return <>{!compact && !!note.text && <ThemedText muted variant="caption">{note.text}</ThemedText>}
    {compact ? <Chip label={setupLabel(equipment)} onPress={() => setOpen(true)} /> : <View style={{ alignSelf: 'flex-start' }}><Pick onSurface text={setupLabel(equipment)} onPress={() => setOpen(true)} /></View>}
    {open && <SetupEditor store={store} name={name} title={setupLabel(equipment)} onClose={() => setOpen(false)} />}</>;
}
function SetupEditor({ store, name, title, onClose }: { store: WorkoutStore; name: string; title: string; onClose: () => void }) {
  const note = store.preferences().machine(name);
  const [text, setText] = useState(note.text), [step, setStep] = useState(note.step === undefined ? '' : String(note.step)),
    [bar, setBar] = useState(note.bar_weight === undefined ? '' : String(note.bar_weight)),
    [override, setOverride] = useState<Unit | undefined>(note.unit_override), [error, setError] = useState(false);
  const unit = override ?? store.unit();
  function changeUnit(next: Unit | undefined) {
    const nextUnit = next ?? store.unit();
    const convert = (value: string) => /^\d+(?:\.\d{1,2})?$/.test(value.trim()) && Number.isFinite(Number(value))
      ? String(rounded(fromKg(toKg(Number(value), unit), nextUnit))) : '';
    setStep(convert(step));
    setBar(convert(bar));
    setOverride(next);
  }
  return <Sheet expanded label={`${name} · ${title}`} onClose={onClose}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={layout.stack}>
    <Field label={t('machineNotes')} placeholder={t('machineNotesHint')} multiline value={text} onChangeText={setText} inputStyle={{ minHeight: 72, textAlignVertical: 'top' }} />
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing[2] }}>
      <Field style={{ flex: 1 }} label={t('setupStep').replace('{unit}', unit)} keyboardType="decimal-pad" value={step} placeholder={unit === 'lb' ? '10' : '5'} onChangeText={setStep} />
      <Field style={{ flex: 1 }} label={t('barWeight').replace('{unit}', unit)} keyboardType="decimal-pad" value={bar} placeholder={unit === 'lb' ? '45' : '20'} onChangeText={setBar} />
    </View>
    <ThemedText muted variant="caption">{t('setupStepHint')}</ThemedText>
    <View style={{ gap: tokens.spacing[0] }}>
      <ThemedText muted variant="caption" style={semibold}>{t('setupUnit')}</ThemedText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: tokens.spacing[1] }}>
        <Pick onSurface text={t('defaultUnit')} selected={!override} onPress={() => changeUnit(undefined)} />
        {(['lb', 'kg'] as const).map(u => <Pick key={u} onSurface text={u} label={t('exerciseUnit').replace('{unit}', u)} selected={override === u} onPress={() => changeUnit(u)} />)}
      </View>
    </View>
    {error && <Trouble text={t('invalidSetup')} />}
    <Primary label={t('saveSetup')} onPress={() => {
      try {
        const numeric = /^\d+(?:\.\d{1,2})?$/;
        if ((step.trim() && !numeric.test(step.trim())) || (bar.trim() && !numeric.test(bar.trim()))) throw Error();
        store.preferences().saveMachine(name, { text, step: step.trim() ? Number(step) : undefined, bar_weight: bar.trim() ? Number(bar) : undefined, unit_override: override }, store.unit());
        onClose();
      } catch { setError(true); }
    }} />
  </ScrollView></Sheet>;
}
