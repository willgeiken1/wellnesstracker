import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import type { WorkoutStore } from '@/data/workout/store';
import type { Unit } from '@/core/workout/rules';
import { t } from '@/i18n/en';
import { layout } from './primitives';
export function PlateSettings({ store }: { store: WorkoutStore }) {
  return <View style={layout.stack}><ThemedText>{t('gymPlates')}</ThemedText><ThemedText muted>{t('gymPlatesHelp')}</ThemedText>
    {(['lb', 'kg'] as const).map(unit => <PlateInput key={unit} store={store} unit={unit} />)}
  </View>;
}
function PlateInput({ store, unit }: { store: WorkoutStore; unit: Unit }) {
  const [value, setValue] = useState(() => store.preferences().plateSet(unit).join(', '));
  const [status, setStatus] = useState<'error' | 'saved' | null>(null);
  const { colors } = useTheme();
  const label = t('availablePlates').replace('{unit}', unit);
  return <View style={layout.stack}>
    <ThemedText>{label}</ThemedText>
    <TextInput accessibilityLabel={label} value={value} onChangeText={text => { setValue(text); setStatus(null); }} style={[layout.input, { color: colors.text, backgroundColor: colors['surface-2'] }]} />
    <Button label={t('savePlates').replace('{unit}', unit)} variant="secondary" onPress={() => {
      try {
        const parts = value.trim() ? value.split(',').map(v => v.trim()) : [];
        if (parts.some(v => !/^\d+(?:\.\d{1,2})?$/.test(v))) throw Error();
        store.preferences().savePlates(unit, parts.map(Number));
        setStatus('saved');
      } catch { setStatus('error'); }
    }} />
    {status && <ThemedText accessibilityRole="alert">{t(status === 'error' ? 'invalidPlates' : 'preferenceSaved')}</ThemedText>}
  </View>;
}
