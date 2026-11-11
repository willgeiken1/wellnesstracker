import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import type { WorkoutStore } from '@/data/workout/store';
import type { Unit } from '@/core/workout/rules';
import { Group, semibold } from '@/features/settings/parts';
import { t } from '@/i18n/en';
import { layout } from './primitives';
const UNITS = ['lb', 'kg'] as const;
/** Typed text to plate sizes, or null when any part is not a plain positive number with at most two decimals. */
function parsePlates(text: string): number[] | null {
  const parts = text.trim() ? text.split(',').map(v => v.trim()) : [];
  return parts.some(v => !/^\d+(?:\.\d{1,2})?$/.test(v)) ? null : parts.map(Number);
}
/** Both plate lists, one Save. Nothing is stored until every list reads correctly, and only a list that was edited is written. */
export function PlateSettings({ store }: { store: WorkoutStore }) {
  const { colors } = useTheme();
  const read = () => ({ lb: store.preferences().plateSet('lb').join(', '), kg: store.preferences().plateSet('kg').join(', ') });
  const [saved, setSaved] = useState(read);
  const [text, setText] = useState(saved);
  const [invalid, setInvalid] = useState<readonly Unit[]>([]);
  const [done, setDone] = useState(false);
  const save = () => {
    const parsed = UNITS.map(unit => ({ unit, sizes: parsePlates(text[unit]) }));
    const bad = parsed.filter(item => item.sizes === null).map(item => item.unit);
    setInvalid(bad); setDone(false);
    if (bad.length) return;
    const failed: Unit[] = [];
    for (const { unit, sizes } of parsed) {
      if (text[unit] === saved[unit] || !sizes) continue;
      try { store.preferences().savePlates(unit, sizes); } catch { failed.push(unit); }
    }
    setInvalid(failed);
    setSaved(current => ({ ...current, ...Object.fromEntries(UNITS.filter(unit => !failed.includes(unit)).map(unit => [unit, text[unit]])) }));
    setDone(failed.length === 0);
  };
  return <Group testID="plate-settings">
    <View style={{ paddingVertical: tokens.spacing[2], gap: tokens.spacing[2] }}>
      <ThemedText muted variant="caption">{t('gymPlatesHelp')}</ThemedText>
      {UNITS.map(unit => {
        const label = t('availablePlates').replace('{unit}', unit), wrong = invalid.includes(unit);
        return <View key={unit} style={{ gap: tokens.spacing[1] }}>
          <ThemedText style={semibold}>{label}</ThemedText>
          <TextInput accessibilityLabel={label} value={text[unit]} keyboardType="numbers-and-punctuation" autoCorrect={false}
            onChangeText={value => { setText(current => ({ ...current, [unit]: value })); setDone(false); setInvalid(current => current.filter(item => item !== unit)); }}
            style={[layout.input, { color: colors.text, backgroundColor: colors['surface-2'], fontSize: tokens.type.body, borderWidth: 1, borderColor: wrong ? colors.danger : colors['surface-2'] }]} />
          {wrong && <ThemedText testID={`plates-error-${unit}`} muted variant="caption" accessibilityRole="alert">{t('invalidPlates')}</ThemedText>}
        </View>;
      })}
      <Button testID="plates-save" label={t('settingsSavePlates')} onPress={save} />
      {done && <ThemedText testID="plates-saved" muted variant="caption" accessibilityLiveRegion="polite">{t('settingsPlatesSaved')}</ThemedText>}
    </View>
  </Group>;
}
