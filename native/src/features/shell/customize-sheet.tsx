import { useEffect, useState } from 'react';
import { Animated, Easing, ScrollView, Switch, View } from 'react-native';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { alpha, mix, shellColors } from './colors';
import { SPRINGS } from './geometry';
import { ActionIcon } from './icons';
import { customizeOrder, defaultActionIds, MAX_ACTIONS, pageLabel, pageOf, toggleDraft, type PageKey } from './pages';
import { showToast } from './toast';

export interface CustomizeSheetProps {
  /** The page being customised, or null when the sheet is closed. */
  page: PageKey | null; height: number; insetBottom: number;
  initial: string[]; hintOf: (page: PageKey, id: string) => string; labelOf: (page: PageKey, id: string) => string;
  /** Done saves and reopens the actions; a tap on the shade saves and stays closed. */
  onCommit: (ids: string[], reopen: boolean) => void;
}

/** Pick which quick actions the + shows on a page, and their order: the order they are turned on. */
export function CustomizeSheet({ page, height, insetBottom, initial, hintOf, labelOf, onCommit }: CustomizeSheetProps) {
  const { colors, mode, reduceMotion } = useTheme();
  const shell = shellColors(colors, mode);
  const [shownPage, setShownPage] = useState(page);
  const [draft, setDraft] = useState(initial);
  if (page && page !== shownPage) { setShownPage(page); setDraft(initial); }
  const slide = useState(() => new Animated.Value(height))[0], shade = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    if (page) {
      Animated.parallel([
        reduceMotion ? Animated.timing(slide, { toValue: 0, duration: 0, useNativeDriver: false }) : Animated.spring(slide, { toValue: 0, ...SPRINGS.sheet, mass: 1, useNativeDriver: false }),
        Animated.timing(shade, { toValue: 1, duration: reduceMotion ? 0 : 220, easing: Easing.linear, useNativeDriver: false }),
      ]).start();
    } else if (shownPage) {
      Animated.parallel([
        Animated.timing(slide, { toValue: height, duration: reduceMotion ? 0 : 260, easing: Easing.bezier(0.3, 0.7, 0.3, 1), useNativeDriver: false }),
        Animated.timing(shade, { toValue: 0, duration: reduceMotion ? 0 : 220, easing: Easing.linear, useNativeDriver: false }),
      ]).start(({ finished }) => { if (finished) setShownPage(null); });
    }
  }, [page, shownPage, slide, shade, height, reduceMotion]);
  if (!shownPage) return null;
  const color = colors[pageOf(shownPage).color];
  const toggle = (id: string) => {
    const { next, refused } = toggleDraft(draft, id);
    if (refused) showToast(t(refused === 'keepOne' ? 'shellKeepOne' : 'shellFiveMost'), { color: 'warning' });
    else setDraft(next);
  };
  const muted = { fontFamily: tokens.font.body, color: colors['text-muted'] };
  return <View pointerEvents={page ? 'auto' : 'none'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }}>
    <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.42)', opacity: shade }}>
      <Tappable dim="none" accessible={false} style={{ flex: 1 }} onPress={() => onCommit(draft, false)} />
    </Animated.View>
    <Animated.View accessibilityViewIsModal testID="customize-sheet" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: height * 0.84,
      borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: shell.dark ? colors.surface : shell.sheet,
      boxShadow: '0px -10px 40px rgba(0, 0, 0, 0.4)', transform: [{ translateY: slide }] }}>
      <View style={{ width: 36, height: 5, borderRadius: 2.5, backgroundColor: alpha(colors.text, 0.22), alignSelf: 'center', marginTop: 5, marginBottom: 7 }} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingTop: 10, paddingHorizontal: 20, paddingBottom: 6 }}>
        <View style={{ flex: 1 }}>
          <ThemedText accessibilityRole="header" style={{ fontFamily: tokens.font.heading, fontSize: 22, lineHeight: 25.3, letterSpacing: -0.66 }}>
            {t('shellQuickActions').replace('{page}', pageLabel(shownPage))}</ThemedText>
          <ThemedText style={[muted, { marginTop: 5, fontSize: 13.5, lineHeight: 18.2 }]}>{t('shellCustomizeBody')}</ThemedText>
        </View>
        <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={t('shellDone')} onPress={() => onCommit(draft, true)} hitSlop={{ top: 4, bottom: 4 }}
          style={{ marginTop: 2, minHeight: 36, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center', backgroundColor: colors.accent }}>
          <ThemedText style={{ fontFamily: tokens.font.heading, fontSize: 14, color: colors['on-accent'] }}>{t('shellDone')}</ThemedText>
        </Tappable>
      </View>
      <ThemedText style={{ paddingTop: 4, paddingHorizontal: 20, paddingBottom: 8, fontFamily: tokens.font.bodyStrong, fontSize: tokens.type.caption, color: colors['text-muted'] }}>
        <ThemedText style={{ fontFamily: tokens.font.heading, fontSize: tokens.type.caption, color: colors.text }}>{String(draft.length)}</ThemedText>
        {t('shellShownCount').replace('{n}', '').replace('{max}', String(MAX_ACTIONS))}
      </ThemedText>
      <ScrollView accessibilityRole="list" style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 6 }} showsVerticalScrollIndicator={false}>
        {customizeOrder(shownPage, draft).map(action => {
          const on = draft.includes(action.id), full = !on && draft.length >= MAX_ACTIONS, label = labelOf(shownPage, action.id);
          return <View key={action.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, borderBottomWidth: 1, borderBottomColor: colors.hair }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: mix(color, shell.dark ? 0.17 : 0.1, colors.surface) }}>
              <ActionIcon name={action.icon} size={20} color={color} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontFamily: tokens.font.bodyStrong, fontSize: 15, lineHeight: 18 }}>{label}</ThemedText>
              <ThemedText style={[muted, { marginTop: 2, fontSize: tokens.type.caption, lineHeight: 17 }]}>{hintOf(shownPage, action.id)}</ThemedText>
            </View>
            {on && <ThemedText style={{ marginRight: 8, fontFamily: tokens.font.heading, fontSize: tokens.type.caption, color: colors['text-muted'], fontVariant: ['tabular-nums'] }}>{String(draft.indexOf(action.id) + 1)}</ThemedText>}
            <Switch accessibilityLabel={t('shellShowAction').replace('{name}', label)} value={on} onValueChange={() => toggle(action.id)}
              trackColor={{ false: colors['hair-2'], true: colors.success }} thumbColor="#FFFFFF" ios_backgroundColor={colors['hair-2']} style={{ opacity: full ? 0.4 : 1 }} />
          </View>;
        })}
      </ScrollView>
      <View style={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: Math.max(30, insetBottom + 12), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <ThemedText style={[muted, { flex: 1, fontSize: tokens.type.caption, lineHeight: 17.5 }]}>{t('shellCustomizeFoot')}</ThemedText>
        <Tappable accessibilityRole="button" accessibilityLabel={t('shellReset')} onPress={() => setDraft(defaultActionIds(shownPage))}
          style={{ minHeight: 44, paddingHorizontal: 4, justifyContent: 'center' }}>
          <ThemedText style={{ fontFamily: tokens.font.bodyStrong, fontSize: 14, color: colors.accent }}>{t('shellReset')}</ThemedText>
        </Tappable>
      </View>
    </Animated.View>
  </View>;
}
