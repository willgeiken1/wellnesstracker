import { Tabs } from 'expo-router';
import { PlatformPressable } from 'expo-router/react-navigation';
import { useTheme } from '@/design/theme-provider';
import { tabs } from '@/features/shell/tabs';
import { Icon } from './icon';
import { t } from '@/i18n/en';
export default function AppTabs() {
  const { colors } = useTheme();
  return <Tabs screenOptions={{ headerShown: false, tabBarAllowFontScaling: true,
    tabBarButton: props => <PlatformPressable {...props} accessibilityRole="button" />, tabBarActiveTintColor: colors.accent,
    tabBarInactiveTintColor: colors['text-muted'], tabBarStyle: { backgroundColor: colors.bg } }}>
    {tabs.map(tab => <Tabs.Screen key={tab.route} name={tab.route} options={{ title: t(tab.label),
      tabBarAccessibilityLabel: t(tab.label), tabBarIcon: ({ color }) => <Icon name={tab.label} color={color} /> }} />)}
  </Tabs>;
}
