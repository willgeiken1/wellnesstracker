import { View, Pressable, ScrollView } from 'react-native';
import { useState } from 'react';
import { equipmentLabel, t } from '@/i18n/en';
import { keypad, plates, rounded, step, type Equipment, type Unit } from '@/core/workout/rules';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { Line, Sheet, layout } from './primitives';
export interface Cursor {
  entryId: string;
  index: number;
  field: 'weight' | 'reps';
}
export function Keypad({
  label,
  field,
  unit,
  equipment,
  value,
  previous,
  onChange,
  onNext,
  onClose
}: {
  label: string;
  field: 'weight' | 'reps';
  unit: Unit;
  equipment: Equipment;
  value: string;
  previous: string;
  onChange: (value: string) => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const {
    colors
  } = useTheme();
  const [wheel, setWheel] = useState(false),
    [wheelBase, setWheelBase] = useState(0);
  const increment = field === 'reps' ? 1 : step(equipment, unit),
    p = plates(Number(value), unit);
  const adjust = (n: number) => onChange(String(rounded(Math.max(0, Number(value || 0) + n))));
  const openWheel = () => {
    setWheelBase(Number(value || 0));
    setWheel(w => !w);
  };
  const nextLabel = field === 'weight' ? t('nextReps') : t('nextSet');
  const keys = ['1', '2', '3', 'minus', '4', '5', '6', 'plus', '7', '8', '9', 'wheel', field === 'weight' ? '.' : '', '0', 'backspace', 'next'];
  return <Sheet testID="keypad-sheet" closeTestID="keypad-close" label={label} onClose={onClose}><ScrollView contentContainerStyle={layout.stack} keyboardShouldPersistTaps="handled">
    <View style={[layout.row, {
        justifyContent: 'space-between'
      }]}><ThemedText numeric variant="display">{value || '—'} <ThemedText muted>{field === 'weight' ? unit : t('reps')}</ThemedText></ThemedText><View><ThemedText muted variant="caption">{t('lastTime')}</ThemedText><ThemedText numeric>{previous || '—'}</ThemedText></View></View>
    {equipment === 'barbell' && field === 'weight' && value !== '' && <View style={[layout.input, {
        backgroundColor: colors['surface-2']
      }]}><ThemedText muted variant="caption">{t('platesPerSide')}: {p.plates.join(' + ') || '—'} · {p.bar} {unit} {t('bar')}{p.remainder !== 0 ? ` · ${t('plateRemainder')}` : ''}</ThemedText></View>}
    {wheel && <ScrollView horizontal snapToInterval={64} decelerationRate="fast" accessibilityLabel={`${equipmentLabel(equipment)}, ${t('weightWheel')}`} contentOffset={{
        x: 640,
        y: 0
      }} onMomentumScrollEnd={event => {
        const index = Math.round(event.nativeEvent.contentOffset.x / 64);
        onChange(String(rounded(Math.max(0, wheelBase + (index - 10) * (increment || 1)))));
      }}>{Array.from({
          length: 21
        }, (_, i) => {
          const n = rounded(Math.max(0, wheelBase + (i - 10) * (increment || 1)));
          return <Pressable key={i} accessibilityRole="button" accessibilityLabel={String(n)} onPress={() => onChange(String(n))} style={[layout.cell, {
            width: 64
          }]}><ThemedText numeric>{n}</ThemedText></Pressable>;
        })}</ScrollView>}
    <View style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8
      }}>{keys.map((key, i) => {
          const unavailable = !key || (key === 'minus' || key === 'plus') && increment === 0;
          const text = key === 'minus' ? `−${increment}` : key === 'plus' ? `+${increment}` : key === 'wheel' ? t('holdWheel') : key === 'next' ? nextLabel : key;
          const label = key === 'backspace' ? t('backspace') : unavailable ? t('blankKey') : text;
          const action = () => {
            if (key === 'minus') adjust(-increment);else if (key === 'plus') adjust(increment);else if (key === 'wheel') openWheel();else if (key === 'next') onNext();else onChange(keypad(value, key, field === 'weight'));
          };
          return <Pressable testID={key === 'next' ? 'keypad-next' : `keypad-key-${key}`} key={`${key}${i}`} accessibilityRole="button" accessibilityLabel={label} disabled={unavailable} onLongPress={key === 'wheel' ? openWheel : undefined} onPress={action} style={[layout.cell, {
            width: '22%',
            flexGrow: 1,
            minHeight: 56,
            backgroundColor: key === 'next' ? colors.accent : colors['surface-2']
          }]}>{key === 'backspace' ? <Line name="backspace" /> : <ThemedText numeric={key !== 'wheel' && key !== 'next'} variant={key === 'wheel' || key === 'next' ? 'caption' : 'title'} style={{
              textAlign: 'center',
              color: key === 'next' ? colors['on-accent'] : colors.text
            }}>{unavailable ? '' : text}</ThemedText>}</Pressable>;
        })}</View>
  </ScrollView></Sheet>;
}
