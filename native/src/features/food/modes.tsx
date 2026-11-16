import { Pressable, useWindowDimensions, View } from 'react-native';
import { ThemedText } from '../../components/themed-text';
import { useTheme } from '../../design/theme-provider';
import { t } from '../../i18n/en';
import { Glyph, semibold } from './parts';
import { AI_FEATURES_ENABLED } from '../ai-launch';

/** The ways to log food, in the order they are offered. Manual entry is reached from Search. */
const ALL_LOG_MODES = ['search', 'scan', 'snap', 'describe', 'saved'] as const;
export type LogMode = typeof ALL_LOG_MODES[number];
/** Snap and Describe are AI; they are left out while AI is off for launch. */
export const LOG_MODES: readonly LogMode[] = AI_FEATURES_ENABLED ? ALL_LOG_MODES : ALL_LOG_MODES.filter(mode => mode !== 'snap' && mode !== 'describe');
const LABEL = { search: 'foodSearch', scan: 'foodScan', snap: 'foodSnap', describe: 'foodDescribe', saved: 'foodSaved' } as const;

/** One row of five: an icon and a word each, with the chosen one marked. */
export function FoodLogModes({ value, onChange }: { value: LogMode | null; onChange: (mode: LogMode) => void }) {
  const { colors } = useTheme();
  // Equal tiles that fit five across at 390pt; with larger text each tile asks for more room and the row wraps.
  const basis = Math.round(58 * Math.max(1, useWindowDimensions().fontScale ?? 1));
  return <View accessibilityRole="tablist" accessibilityLabel={t('foodLogWays')} testID="food-log-modes" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
    {LOG_MODES.map(mode => {
      const selected = mode === value;
      return <Pressable key={mode} testID={`food-log-mode-${mode}`} accessibilityRole="tab" accessibilityLabel={t(LABEL[mode])} accessibilityState={{ selected }} onPress={() => onChange(mode)}
        style={({ pressed }) => ({ flexGrow: 1, flexBasis: basis, minHeight: 64, paddingVertical: 8, paddingHorizontal: 2, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4,
          backgroundColor: selected ? colors['accent-tint'] : colors.surface, borderWidth: 2, borderColor: selected ? colors.accent : 'transparent', opacity: pressed ? 0.7 : 1 })}>
        <Glyph name={mode} size={22} color={selected ? colors.text : colors.food} />
        <ThemedText variant="caption" style={[{ textAlign: 'center' }, selected && semibold]}>{t(LABEL[mode])}</ThemedText>
      </Pressable>;
    })}
  </View>;
}
