import { NativeTabs } from 'expo-router/native-tabs';
import { useTheme } from '@/design/theme-provider';
import { tabs } from '@/features/shell/tabs';
import { t } from '@/i18n/en';
import { FloatingTabs } from './floating-tabs';
const images = {
  home: require('../../assets/images/navigation/home.png'),
  workouts: require('../../assets/images/navigation/workouts.png'),
  food: require('../../assets/images/navigation/food.png'),
  progress: require('../../assets/images/navigation/progress.png'),
  insights: require('../../assets/images/navigation/insights.png'),
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
      <NativeTabs.Trigger.Icon sf={tab.symbol} src={images[tab.label]} renderingMode="template" />
    </NativeTabs.Trigger>)}
  </NativeTabs>;
}
