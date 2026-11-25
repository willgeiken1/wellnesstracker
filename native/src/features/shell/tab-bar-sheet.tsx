import { ScrollView, Switch, View } from 'react-native';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { alpha, shellColors } from './colors';
import { NavIcon } from './icons';
import { PAGES, pageLabel, type PageKey } from './pages';
import { useShellPrefs, withHidden } from './prefs';

/**
 * The Tab bar sheet: pick the tabs on the bar. Home always stays; a hidden page keeps an Open button here, so it is one tap away.
 * Opened by touch and hold on the bar, and from Settings. `current` is the page open behind the sheet, if any.
 */
export function TabBarSheet({ current, onDone, onOpen }: { current: PageKey | null; onDone: () => void; onOpen: (page: PageKey) => void }) {
  const { colors, mode } = useTheme();
  const shell = shellColors(colors, mode);
  const [prefs, save] = useShellPrefs();
  const body = { fontFamily: tokens.font.body, color: colors['text-muted'] };
  return <View style={{ flexShrink: 1, backgroundColor: shell.sheet }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 4, paddingHorizontal: 8 }}>
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        <Tappable accessibilityRole="button" accessibilityLabel={t('shellDone')} onPress={onDone}
          style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 8, justifyContent: 'center' }}>
          <ThemedText style={{ fontFamily: tokens.font.body, fontSize: 17, letterSpacing: -0.17, color: colors.accent }}>{t('shellDone')}</ThemedText>
        </Tappable>
      </View>
      <ThemedText accessibilityRole="header" style={{ fontFamily: tokens.font.heading, fontSize: 17, letterSpacing: -0.34, textAlign: 'center' }}>{t('shellTabBar')}</ThemedText>
      <View style={{ flex: 1 }} />
    </View>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 32, paddingBottom: 64 }}>
      <ThemedText style={[body, { marginTop: 4, marginHorizontal: 4, marginBottom: 14, fontSize: 14, lineHeight: 19.6 }]}>{t('shellTabBarIntro')}</ThemedText>
      <View style={{ backgroundColor: shell.sheetList, borderRadius: 20, overflow: 'hidden', boxShadow: shell.cardEdge }}>
        {PAGES.map((page, i) => {
          const home = page.key === 'home', hidden = !home && !!prefs.hidden[page.key], label = pageLabel(page.key), color = colors[page.color];
          const status = home ? t('shellAlwaysOn') : hidden ? t(current === page.key ? 'shellHiddenOpen' : 'shellHidden') : t('shellOnBar');
          return <View key={page.key} testID={`tab-bar-row-${page.key}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, paddingHorizontal: 16 }}>
            {i > 0 && <View style={{ position: 'absolute', top: 0, left: 16, right: 0, height: 1, backgroundColor: colors.hair }} />}
            <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(color, 0.15), opacity: hidden ? 0.45 : 1 }}>
              <NavIcon name={page.key} size={20} color={color} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontFamily: tokens.font.bodyStrong, fontSize: 15.5, lineHeight: 19.4, letterSpacing: -0.155 }}>{label}</ThemedText>
              <ThemedText style={[body, { marginTop: 2, fontSize: 13, lineHeight: 17.55 }]}>{status}</ThemedText>
            </View>
            {hidden && <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={t('shellOpenPage').replace('{name}', label)} onPress={() => onOpen(page.key)} hitSlop={{ top: 6, bottom: 6 }}
              style={{ minHeight: 32, paddingHorizontal: 14, marginRight: 4, borderRadius: 999, justifyContent: 'center', backgroundColor: colors.ghost }}>
              <ThemedText style={{ fontFamily: tokens.font.bodyStrong, fontSize: 13.5, color: colors.text }}>{t('shellOpen')}</ThemedText>
            </Tappable>}
            {!home && <Switch accessibilityLabel={t('shellShowOnBar').replace('{name}', label)} value={!hidden} onValueChange={on => save(withHidden(prefs, page.key, !on))}
              trackColor={{ false: colors['hair-2'], true: colors.success }} thumbColor="#FFFFFF" ios_backgroundColor={colors['hair-2']} />}
          </View>;
        })}
      </View>
      <ThemedText style={[body, { marginTop: 8, marginHorizontal: 16, fontSize: tokens.type.caption, lineHeight: 18.5, textAlign: 'center' }]}>{t('shellTabBarFoot')}</ThemedText>
    </ScrollView>
  </View>;
}
