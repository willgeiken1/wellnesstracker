import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { colorMix, rgba } from './depth';
import { tileRoutes } from './nav';
import { sectionValues, sectionsOf } from './section-store';
import { useSections } from './sections';
import type { TileStorage } from './store';
import { TileIcon } from './tile-icon';
import { EmptyBlock, SheetHeader, sheetBg, sheetCard } from './ui';
import { Tappable } from '@/components/tappable';

/** Customize one page section: a row per option, then Hide this section. Changes show on the page as they are picked. */
export function PageSectionSheet({ page, id, storage }: { page: unknown; id: unknown; storage?: TileStorage | null }) {
  const pg = typeof page === 'string' ? page : '';
  const { colors, mode, reduceMotion: rm } = useTheme();
  const insets = useSafeAreaInsets();
  const { store, prefs } = useSections(pg, storage);
  const close = useCallback(() => tileRoutes().close(), []);
  const list = sectionsOf(pg) ?? [];
  const x = list.find(s => s.id === id);
  if (!x) return <View style={[s.root, { backgroundColor: sheetBg(colors, mode) }]}>
    <View style={s.pad}><SheetHeader title={t('sectionsCustomizeTitle')} left={t('tilesDone')} onLeft={close} colors={colors} mode={mode} /></View>
    <EmptyBlock title={t('sectionsOpenFirst')} body={t('sectionsOpenFirstBody')} colors={colors} />
  </View>;
  const v = sectionValues(prefs, x);
  const segBg = mode === 'dark' ? colors.bg : colorMix(colors.text, 0.07, colors.bg);
  const segOn = mode === 'dark'
    ? { backgroundColor: colorMix(colors.text, 0.14, colors.surface), boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }
    : { backgroundColor: colors.surface, boxShadow: `0 1px 3px ${rgba(colors.text, 0.18)}` };
  const hide = () => { close(); setTimeout(() => store.setHidden(list, x.id, true), rm ? 0 : 240); };
  return <ScrollView style={{ backgroundColor: sheetBg(colors, mode) }} contentContainerStyle={[s.pad, { paddingBottom: 24 + insets.bottom }]} stickyHeaderIndices={[0]}>
    <SheetHeader title={x.title} left={t('tilesDone')} onLeft={close} colors={colors} mode={mode} />
    <View style={s.body}>
      {(x.options ?? []).map(op => {
        const wide = op.choices.length > 3;
        return <View key={op.id} style={[s.row, sheetCard(colors, mode), wide && s.wide]}>
          <Text style={[s.label, { color: colors.text }]}>{op.label}</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel={op.label} style={[s.seg, { backgroundColor: segBg }, wide && s.segWide]}>
            {op.choices.map(c => {
              const on = String(v[op.id]) === String(c[0]);
              return <Tappable dim={on ? 'none' : 'row'} key={String(c[0])} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => store.setOption(x.id, op.id, String(c[0]))}
                style={[s.btn, wide && s.btnWide, on && segOn]}>
                <Text numberOfLines={1} style={[s.btnText, { color: on ? colors.text : colors['text-muted'] }]}>{c[1]}</Text>
              </Tappable>;
            })}
          </View>
        </View>;
      })}
      <Pressable accessibilityRole="button" onPress={hide} style={({ pressed }) => [s.hide, sheetCard(colors, mode), pressed && { opacity: 0.75 }]}>
        <TileIcon name="minus" size={15} color={colors.danger} />
        <Text style={[s.hideText, { color: colors.danger }]}>{t('sectionsHideThis')}</Text>
      </Pressable>
    </View>
  </ScrollView>;
}

const s = StyleSheet.create({
  root: { flex: 1 },
  pad: { paddingHorizontal: 16 },
  body: { paddingTop: 4, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: 14, marginBottom: 10, borderRadius: 18 },
  wide: { flexDirection: 'column', alignItems: 'stretch', gap: 10, paddingVertical: 12 },
  label: { fontFamily: tokens.font.bodyStrong, fontSize: 15 },
  seg: { flexDirection: 'row', gap: 2, padding: 2, borderRadius: 12 },
  segWide: { alignSelf: 'stretch' },
  btn: { minWidth: 50, minHeight: 34, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnWide: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
  btnText: { fontFamily: tokens.font.heading, fontSize: 13 },
  hide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', minHeight: 50, marginTop: 6, borderRadius: 16 },
  hideText: { fontFamily: tokens.font.bodyStrong, fontSize: 15 },
});
