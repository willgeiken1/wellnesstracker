import { NativeTabs } from 'expo-router/native-tabs';
import { useTheme } from '@/design/theme-provider';
import { tabs } from '@/features/shell/tabs';
import { t } from '@/i18n/en';
import { FloatingTabs } from './floating-tabs';
/* The system bar takes pictures, not components: each tab's icon from the Insight set, drawn at 1x, 2x and 3x by
   scripts/gen-tab-icons.py, with the filled twin for the open tab. The bar tints them. */
const images = {
  home: { default: require('../../assets/images/navigation/home.png'), selected: require('../../assets/images/navigation/home-selected.png') },
  workouts: { default: require('../../assets/images/navigation/workouts.png'), selected: require('../../assets/images/navigation/workouts-selected.png') },
  food: { default: require('../../assets/images/navigation/food.png'), selected: require('../../assets/images/navigation/food-selected.png') },
  progress: { default: require('../../assets/images/navigation/progress.png'), selected: require('../../assets/images/navigation/progress-selected.png') },
  routines: { default: require('../../assets/images/navigation/routines.png'), selected: require('../../assets/images/navigation/routines-selected.png') },
};
export default function AppTabs() {
  const { colors, barLook } = useTheme();
  // Standard tints the bar with the theme's background. Glass leaves the system's clear material, so content shows through it.
  const glass = barLook === 'glass';
  // Floating is the person's own choice in Appearance: a custom bar in place of the system one.
  if (barLook === 'floating') return <FloatingTabs />;
  return <NativeTabs backgroundColor={glass ? undefined : colors.bg} blurEffect={glass ? 'systemUltraThinMaterial' : undefined} tintColor={colors.accent}
    iconColor={{ default: colors['text-muted'], selected: colors.accent }}
    labelStyle={{ default: { color: colors['text-muted'] }, selected: { color: colors.text } }}
    indicatorColor={colors['surface-2']} disableTransparentOnScrollEdge={!glass}>
    {tabs.map(tab => <NativeTabs.Trigger key={tab.route} name={tab.route} accessibilityLabel={t(tab.label)}>
      <NativeTabs.Trigger.Label>{t(tab.label)}</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon src={images[tab.label]} renderingMode="template" />
    </NativeTabs.Trigger>)}
  </NativeTabs>;
}
