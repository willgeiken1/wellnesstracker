import { NativeTabs } from 'expo-router/native-tabs';
import { useTheme } from '@/design/theme-provider';
import { tabs } from '@/features/shell/tabs';
import { t } from '@/i18n/en';
const images = {
  home: require('../../assets/images/navigation/home.png'),
  workouts: require('../../assets/images/navigation/workouts.png'),
  food: require('../../assets/images/navigation/food.png'),
  progress: require('../../assets/images/navigation/progress.png'),
  insights: require('../../assets/images/navigation/insights.png'),
};
export default function AppTabs() {
  const { colors } = useTheme();
  return <NativeTabs backgroundColor={colors.bg} tintColor={colors.accent}
    iconColor={{ default: colors['text-muted'], selected: colors.accent }}
    labelStyle={{ default: { color: colors['text-muted'] }, selected: { color: colors.text } }}
    indicatorColor={colors['surface-2']} disableTransparentOnScrollEdge>
    {tabs.map(tab => <NativeTabs.Trigger key={tab.route} name={tab.route}>
      <NativeTabs.Trigger.Label>{t(tab.label)}</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon sf={tab.symbol} src={images[tab.label]} renderingMode="template" />
    </NativeTabs.Trigger>)}
  </NativeTabs>;
}
