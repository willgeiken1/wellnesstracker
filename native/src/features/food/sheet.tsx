import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { router, useNavigation, type NativeStackNavigationOptions } from 'expo-router';
import { largeSheet, mediumSheet } from '../navigation/presentation';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState, Icon, type IconName, KitText, SheetHeader, SurfaceContext, Tappable, alpha, useKit } from '@/components/kit';
import { t } from '@/i18n/en';
import { kcalOf, num } from './day';
import type { Food } from './model';
import { AddButton } from './ui';
import { weightText, type FoodWeightUnit } from './weight';

/** A stable getter for the newest value, for gesture handlers that are made once. */
export function useLatest<T>(value: T): () => T {
  const ref = useRef(value);
  useEffect(() => { ref.current = value; });
  return useCallback(() => ref.current, []);
}

/* The frame every Food sheet shares, and the food rows its lists are made of (`.fd-frow`). */

/** Native form sheet options: a large sheet stops just short of the top; Quick add and Copy a day are medium sheets at
 * their own heights from the design, as their only detent. */
export function sheetOptions(size: 'large' | 'quick-cal' | 'copy-day'): NativeStackNavigationOptions {
  return { ...(size === 'large' ? largeSheet : mediumSheet(size)), contentStyle: { flex: 1 } };
}
/** Everything inside reads its colours as on a sheet, so cards and fields step up from the sheet in dark mode. */
export function SheetSurface({ children }: { children: ReactNode }) {
  return <SurfaceContext.Provider value="sheet">{children}</SurfaceContext.Provider>;
}
/** Pushed screens (a meal, Nutrition) draw the kit's own bar. */
export const pushedOptions = { headerShown: false } as const;

/** A sheet body with an optional bar pinned to the bottom (`.fd-foot`), such as the Log food tray. */
export function FoodSheet({ header, children, footer, testID, bg }: { header: ReactNode; children: ReactNode; footer?: ReactNode; testID?: string; /** A colour token in place of the sheet colour (the camera sheet is the page colour). */ bg?: string }) {
  const k = useKit(), insets = useSafeAreaInsets();
  return <View testID={testID} style={{ flex: 1, backgroundColor: bg ? k.tok(bg) : k.sheetBg }}>
    <SurfaceContext.Provider value="sheet">
      <View style={{ paddingHorizontal: 16 }}>{header}</View>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: (footer ? 24 : 40) + (footer ? 0 : insets.bottom) }}>{children}</ScrollView>
    </SurfaceContext.Provider>
    {footer ? <View style={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: Math.max(34, insets.bottom), backgroundColor: k.sheetBg,
      borderTopWidth: 1, borderTopColor: k.c.hair, boxShadow: `0 -10px 24px ${alpha(k.c.bg, 0.4)}` }}>{footer}</View> : null}
  </View>;
}

/** Whether this screen was opened cold (a link or a widget), with nothing under it to go back to. */
export function useCold() {
  // Asked after mount and on every stack change: at the first render of a pushed screen the stack has not yet recorded the push.
  const navigation = useNavigation(), [cold, setCold] = useState(false);
  useEffect(() => {
    const check = () => setCold(!navigation.canGoBack());
    check();
    return navigation.addListener('state', check);
  }, [navigation]);
  return cold;
}
/** Puts a sheet away: back to what opened it, or to the Food tab when it was opened cold. */
export function closeSheet() { if (router.canGoBack()) router.back(); else router.replace('/food'); }

/** Shown in a sheet when there is no account or demo to read from. Opened cold, it offers Close. */
export function NoFood() {
  const k = useKit(), cold = useCold();
  return <View style={{ flex: 1, backgroundColor: k.sheetBg }}>
    {cold ? <View style={{ paddingHorizontal: 16 }}><SheetHeader left={t('foodLogClose')} onLeft={() => router.replace('/food')} /></View> : null}
    <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <EmptyState icon="meal" color="food" title={t('foodLogUnavailable')} description={t('foodLogUnavailableBody')} />
    </View>
  </View>;
}

/** The energy on the right of a row: "280 kcal", the unit smaller. */
export function KcalValue({ kcal, strong }: { kcal: number | null; strong?: boolean }) {
  return <KitText weight={700} size={15} tracking={-0.01} numeric color={strong ? 'text' : 'text-muted'} style={{ flexShrink: 0 }}>
    {kcal == null ? '–' : num(kcal)}<KitText weight={600} tracking={0} size={12} color="text-muted">{` ${t('foodKcal')}`}</KitText>
  </KitText>;
}

/** A hairline across the top of a row, 16 pt in, for rows that are not kit ListRows. */
export function RowLine({ inset = 16 }: { inset?: number }) {
  const k = useKit();
  return <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, left: inset, height: 1, backgroundColor: k.c.hair }} />;
}

/** A food you can open or add: name and details, its energy, and a round add button. */
export function FoodRow({ title, sub, kcal, on, first, onOpen, onAdd, openLabel, testID }: {
  title: string; sub: string; kcal: number | null; on: boolean; first: boolean; onOpen: () => void; onAdd: () => void; openLabel: string; testID?: string;
}) {
  const k = useKit();
  return <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6, paddingBottom: 6, paddingLeft: 16, paddingRight: 10 }}>
    {!first && <RowLine />}
    <Tappable dim="none" accessibilityRole="button" accessibilityLabel={openLabel} onPress={onOpen}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, backgroundColor: pressed ? k.tint(k.c.text, 0.05) : 'transparent' })}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <KitText weight={600} size={15.5} lineHeight={1.25} tracking={-0.01} numberOfLines={1}>{title}</KitText>
        {sub ? <KitText weight={500} size={13} lineHeight={1.35} color="text-muted" numberOfLines={1} style={{ marginTop: 2 }}>{sub}</KitText> : null}
      </View>
      <KcalValue kcal={kcal} />
    </Tappable>
    <AddButton on={on} onPress={onAdd} label={`${on ? t('foodRemoveWord') : t('foodAddWord')} ${title}`} />
  </View>;
}

const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
/** A food's serving weight as the person reads it ("6 oz" or "170 g"), or nothing when it is unknown. */
export function foodAmount(food: Food, unit: FoodWeightUnit = 'g') {
  const g = n(food.amount_g) ?? n(food.serving_g);
  return g != null ? weightText(g, unit) : '';
}
/** "My food · 6 oz · 31 g protein" (or "150 g" in metric): where it came from, its serving, its protein. */
export function foodSub(food: Food, mine = false, unit: FoodWeightUnit = 'g') {
  const p = n(food.protein_g);
  return [mine || food.saved_food_id ? t('foodMyFood') : '', foodAmount(food, unit), p != null ? `${num(p)} g ${t('foodProteinLower')}` : ''].filter(Boolean).join(' · ');
}
export const foodKcal = (food: Food) => kcalOf(food.energy_kj);
export const foodKey = (food: Food) => String(food.name ?? '').trim().toLowerCase();

/** A plain tappable row with an icon and a chevron, for the links at the end of a list. */
export function LinkRow({ icon, title, sub, onPress, first, color = 'food' }: { icon: 'bookmark' | 'plus'; title: string; sub?: string; onPress: () => void; first: boolean; color?: string }) {
  const k = useKit(), c = k.tok(color);
  return <Tappable dim="none" accessibilityRole="button" accessibilityLabel={[title, sub].filter(Boolean).join(', ')} onPress={onPress}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: pressed ? k.tint(k.c.text, 0.07) : 'transparent' })}>
    {!first && <RowLine inset={60} />}
    <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: k.tint(c, 0.16) }}><Icon name={icon} size={18} color={c} /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <KitText weight={600} size={15.5} lineHeight={1.25} tracking={-0.01}>{title}</KitText>
      {sub ? <KitText weight={500} size={13} lineHeight={1.35} color="text-muted" style={{ marginTop: 2 }}>{sub}</KitText> : null}
    </View>
    <View style={{ marginHorizontal: -4 }}><Icon name="chevron-right" size={16} color={k.c.ghost} /></View>
  </Tappable>;
}

/** One of the three big buttons under the search field (`.fd-tile`). */
export function ActionTile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const k = useKit();
  return <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={{ flex: 1, minHeight: 76, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 4, backgroundColor: k.cardBg, boxShadow: k.cardEdge }}>
    <Icon name={icon} size={22} color={k.c.food} />
    <KitText weight={600} size={13} numberOfLines={1}>{label}</KitText>
  </Tappable>;
}
