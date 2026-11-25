import React, { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button, KitText, SheetHeader, Tappable, TextField, font, useKit } from '@/components/kit';
import type { Repository } from '@/data/repository';
import { t } from '@/i18n/en';
import { fill } from '../tiles/ui';
import { mealName, quickAdd } from './actions';
import { addToCart, cartItem, currentCart } from './cart';
import { KJ, dayView, nextMealId, num } from './day';
import { meals, saveReusable, type Food } from './model';
import { useFoodDay } from './selection';
import { closeSheet, FoodSheet } from './sheet';
import { Caption, MealSeg, SectionLabel } from './ui';
import { useFoodRevision } from './use-food-revision';
import { showToast } from '../shell/toast';

/** A typed number, or null when the box is blank or not a number. Blank stays unknown, never zero. */
export function parseAmount(text: string): number | null {
  const v = parseFloat(text.replace(/,/g, '').trim());
  return Number.isFinite(v) && v >= 0 ? v : null;
}
/** The food Quick add logs: the energy, and only the macros that were typed. */
export function quickFood(name: string, kcal: number, p: number | null, c: number | null, f: number | null): Food {
  return { name: name.trim() || t('foodTileQuick'), energy_kj: Math.round(kcal) * KJ, protein_g: p, carbs_g: c, fat_g: f, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
}
export const macroKcal = (p: number | null, c: number | null, f: number | null) => (p ?? 0) * 4 + (c ?? 0) * 4 + (f ?? 0) * 9;

/**
 * Quick add (`quick-cal`): just the calories, macros if known, a name and the meal. When the macros add up to more
 * than nothing and no calories are typed, a strip offers to use their total. "Create a food" opens it too, and then
 * the food is also kept in My foods.
 */
export function QuickSheet({ repo, meal: asked, name: given, mine }: { repo: Repository; meal?: string; name?: string; mine?: boolean }) {
  useFoodRevision(repo);
  const k = useKit();
  const { day, today } = useFoodDay();
  const inTray = !!currentCart();
  const [meal, setMeal] = useState(() => currentCart()?.meal ?? (asked && meals(repo).some(m => m.id === asked) ? asked : nextMealId(dayView(repo, today, { today }))));
  const [kcalText, setKcal] = useState(''), [pt, setP] = useState(''), [ct, setC] = useState(''), [ft, setF] = useState(''), [name, setName] = useState(given ?? '');
  const big = useRef<React.ComponentRef<typeof TextInput>>(null);
  const kcal = parseAmount(kcalText), p = parseAmount(pt), c = parseAmount(ct), f = parseAmount(ft), mk = macroKcal(p, c, f);
  const ok = kcal != null && kcal > 0, mn = mealName(repo, meal).toLowerCase();
  const add = () => {
    if (!ok) return;
    const food = quickFood(name, kcal, p, c, f);
    if (mine) { try { saveReusable(repo, food); } catch { /* still logs */ } }
    if (inTray) { addToCart([cartItem(food.name as string, food)]); closeSheet(); if (mine) showToast(t('foodSavedMine'), { color: 'food' }); return; }
    closeSheet(); quickAdd(repo, day, meal, food);
  };
  return <FoodSheet testID="food-quick-sheet"
    header={<SheetHeader title={t('foodTileQuick')} left={t('cancel')} onLeft={() => closeSheet()} right={t('foodAddWord')} onRight={add} rightDisabled={!ok} />}>
    <Tappable dim="none" accessible={false} onPress={() => big.current?.focus()}
      style={{ alignItems: 'center', gap: 4, paddingTop: 18, paddingHorizontal: 16, paddingBottom: 14, borderRadius: 20, backgroundColor: k.cardBg, boxShadow: k.cardEdge }}>
      <KitText weight={700} size={12} tracking={0.1} color="text-muted" style={{ textTransform: 'uppercase' }}>{t('foodCaloriesCap')}</KitText>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8 }}>
        <TextInput ref={big} value={kcalText} onChangeText={setKcal} keyboardType="number-pad" placeholder="0" testID="food-quick-kcal"
          accessibilityLabel={t('foodCaloriesInKcal')} autoComplete="off" placeholderTextColor={k.c.ghost} selectionColor={k.c.food} cursorColor={k.c.food}
          style={[font(700, 52, 1.1, -0.04), { width: 190, textAlign: 'right', color: k.c.text, padding: 0, fontVariant: ['tabular-nums'] }]} />
        <KitText weight={600} size={18} color="text-muted" style={{ width: 120 }}>{t('foodKcal')}</KitText>
      </View>
    </Tappable>
    <SectionLabel title={t('foodMacrosCap')} aside={t('foodOptional')} />
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {([[t('foodMacroProtein'), pt, setP], [t('foodMacroCarbs'), ct, setC], [t('foodMacroFat'), ft, setF]] as const).map(([label, v, set]) =>
        <View key={label} style={{ flex: 1 }}><TextField label={label} unit="g" value={v} onChangeText={set} keyboardType="decimal-pad" placeholder="–"
          accessibilityLabel={fill(t('foodInGrams'), { name: label })} /></View>)}
    </View>
    {mk > 0 && !kcal ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10, paddingVertical: 6, paddingRight: 6, paddingLeft: 14, borderRadius: 14, backgroundColor: k.tint(k.c.food, 0.12) }}>
      <KitText weight={500} size={13.5}>{t('foodMacrosAddUp')} <KitText weight={700} size={13.5} numeric>{`${num(mk)} ${t('foodKcal')}`}</KitText></KitText>
      <Tappable dim="text" accessibilityRole="button" accessibilityLabel={fill(t('foodUseKcal'), { v: num(mk) })} onPress={() => setKcal(String(Math.round(mk)))}
        style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}><KitText weight={700} size={14} color="food">{t('foodUse')}</KitText></Tappable>
    </View> : null}
    <View style={{ marginTop: 16 }}><TextField label={t('foodNameLabel')} value={name} onChangeText={setName} placeholder={given || t('foodTileQuick')} maxLength={80} /></View>
    {inTray ? null : <><SectionLabel title={t('foodAddToCap')} /><MealSeg label={t('foodMealLabel')} meals={meals(repo)} value={meal} onChange={setMeal} /></>}
    <View style={{ marginTop: 16 }}>
      <Button full color="food" icon="plus" disabled={!ok} label={fill(t('foodAddToMeal'), { meal: mn }) + (ok ? ` · ${num(kcal)} ${t('foodKcal')}` : '')} onPress={add} testID="food-quick-add" />
    </View>
    <Caption>{t('foodBlankUnknown')}</Caption>
  </FoodSheet>;
}
