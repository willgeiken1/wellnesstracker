import { View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { rs } from '@/i18n/en';
import { AmountCard } from './add-item-amount-card';
import { parseSheetAmount } from './add-item-amounts';
import { CALC_UNITS, converterView, type ConverterDraft } from './converter';
import { ErrorLine, Help, OutlineButton, PrimaryButton, SheetFrame } from './add-item-frame';

/** One large number in the result well. A dash stands in until there is a result; the well never shows an example. */
function Readout({ testID, label, value, unit }: { testID: string; label: string; value: string; unit?: string }) {
  const { colors } = useTheme();
  return <View accessible accessibilityLabel={value ? `${label}, ${value}${unit ? ` ${unit}` : ''}` : label} style={{ flex: 1, minWidth: 120, gap: 2 }}>
    <ThemedText variant="caption" muted style={{ fontWeight: '600' }}>{label}</ThemedText>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: tokens.spacing[0], flexWrap: 'wrap' }}>
      <ThemedText testID={testID} variant="display" numeric style={{ color: value ? colors.text : colors['text-muted'] }}>{value || '–'}</ThemedText>
      {!!unit && !!value && <ThemedText variant="headline" muted>{unit}</ThemedText>}
    </View>
  </View>;
}

/**
 * The second step of the Add item sheet. It converts the three amounts the
 * user typed into a volume and into U-100 units, and shows the arithmetic.
 * It never fills a field, and nothing it shows is a suggested amount.
 * Save is offered only for a dose item that is already saved.
 */
export function ConverterStep({ draft, onDraft, backLabel, onBack, onClose, canSave, onSave, error, toast }: {
  draft: ConverterDraft; onDraft: (next: ConverterDraft) => void; backLabel: string; onBack: () => void; onClose: () => void;
  canSave: boolean; onSave: (note: string, calc: { vialAmount: unknown; waterMl: unknown; vialUnit: string }) => void; error?: string; toast?: string | null;
}) {
  const { colors } = useTheme();
  const view = converterView(draft);
  const set = (patch: Partial<ConverterDraft>) => onDraft({ ...draft, ...patch });
  return <SheetFrame testID="converter" title={rs('converter')} onClose={onClose} back={{ label: backLabel, onPress: onBack }} toast={toast}>
    <ThemedText testID="converter-intro" muted>{rs('converterIntro')}</ThemedText>
    <AmountCard testID="converter-vial" label={rs('vialAmount')} value={draft.vial} onChange={(vial) => set({ vial })} tone="sleep"
      units={CALC_UNITS} unit={draft.vialUnit} onUnit={(vialUnit) => set({ vialUnit })} unitLabel={rs('vialUnit')} stepsLabel={rs('changeVial')} />
    <AmountCard testID="converter-water" label={rs('waterVolume')} value={draft.water} onChange={(water) => set({ water })} tone="food" fixedUnit="mL" stepsLabel={rs('changeWater')} />
    <AmountCard testID="converter-amount" label={rs('amountToConvert')} value={draft.dose} onChange={(dose) => set({ dose })} tone="accent"
      units={CALC_UNITS} unit={draft.doseUnit} onUnit={(doseUnit) => set({ doseUnit })} unitLabel={rs('amountUnit')} stepsLabel={rs('changeConvert')} />

    <View testID="converter-result" accessibilityLiveRegion="polite" style={{ backgroundColor: colors['surface-2'], borderRadius: 20, padding: tokens.spacing[3], gap: tokens.spacing[2] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[3] }}>
        <Readout testID="converter-volume" label={rs('volume')} value={view.volume} unit="mL" />
        <Readout testID="converter-units" label={rs('u100')} value={view.units} />
      </View>
      {/* A plain bar from 0 to 100. It is a scale, not a drawing of anything. */}
      <View accessible accessibilityRole="progressbar" accessibilityLabel={rs('scale')}
        accessibilityValue={view.ready ? { text: view.over ? rs('over100') : view.units } : { text: '–' }} style={{ gap: tokens.spacing[0] }}>
        <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors['text-muted'], overflow: 'hidden' }}>
          <View testID="converter-scale" style={{ width: `${Math.round(view.scale * 100)}%`, height: '100%', backgroundColor: colors.text }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <ThemedText variant="caption" numeric muted>0</ThemedText>
          {view.over && <ThemedText testID="converter-over" variant="caption" style={{ fontWeight: '600' }}>{rs('over100')}</ThemedText>}
          <ThemedText variant="caption" numeric muted>100</ThemedText>
        </View>
      </View>
      {!view.ready && <ThemedText testID="converter-detail" muted>{view.detail}</ThemedText>}
      {view.lines.map((line) => <ThemedText key={line} testID="converter-line" numeric>{line}</ThemedText>)}
      {!!view.note && <ThemedText testID="converter-note" variant="caption" muted>{view.note}</ThemedText>}
    </View>
    <ThemedText testID="converter-doctor" variant="caption" muted>{rs('doctor')}</ThemedText>

    <View style={{ gap: tokens.spacing[1] }}>
      {canSave && <>
        <PrimaryButton testID="converter-save" label={rs('saveNote')} disabled={!view.itemNote}
          onPress={() => onSave(view.itemNote, { vialAmount: parseSheetAmount(draft.vial), waterMl: parseSheetAmount(draft.water), vialUnit: draft.vialUnit })} />
        <Help>{rs('saveNoteHelp')}</Help>
      </>}
      {!!error && <ErrorLine testID="converter-error">{error}</ErrorLine>}
      <OutlineButton testID="converter-done" label={rs('close')} onPress={onBack} />
    </View>
  </SheetFrame>;
}
