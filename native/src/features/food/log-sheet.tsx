import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Chip, Chips, EmptyState, Icon, KitText, List, SearchField, SheetHeader, Tappable, useKit } from '@/components/kit';
import type { Repository } from '@/data/repository';
import { t } from '@/i18n/en';
import { fill } from '../tiles/ui';
import { addMany, comboKcal, comboProtein, mealName } from './actions';
import { addToCart, cartItem, cartTotals, closeCart, inCart, openCart, removeCartAt, removeFromCart, setCartMeal, useCart } from './cart';
import { nextMealId, dayView, num, plural } from './day';
import { combos, meals, recentFoods, type Combo, type Food } from './model';
import { foodRoutes } from './nav';
import { searchableFoods } from './search';
import { useFoodDay } from './selection';
import { ActionTile, FoodRow, FoodSheet, LinkRow, foodKcal, foodKey, foodSub } from './sheet';
import { MealSeg, SectionLabel } from './ui';
import { useFoodRevision } from './use-food-revision';

type Tab = 'recent' | 'saved' | 'mine' | 'results';
const savedKey = (c: Combo) => `meal:${c.name}`;
const lower = (s: string) => s.toLowerCase();

/**
 * Log food (`log-meal`): pick the meal, then search, scan, quick add or copy, and tap + on foods to gather them in the
 * tray at the bottom. Log puts them all into the meal at once. Search looks only at foods already on this phone.
 */
export function LogSheet({ repo, meal: asked }: { repo: Repository; meal?: string }) {
  useFoodRevision(repo);
  const k = useKit();
  const { day, today } = useFoodDay();
  const mealList = meals(repo);
  const [first] = useState(() => asked && mealList.some(m => m.id === asked) ? asked : nextMealId(dayView(repo, today, { today })));
  const [q, setQ] = useState(''), [tab, setTab] = useState<Tab>('recent');
  useEffect(() => { openCart(first); return () => closeCart(); }, [first]);
  const cart = useCart(), meal = cart?.meal ?? first, items = cart?.items ?? [];

  const recent = useMemo(() => recentFoods(repo).slice(0, 8), [repo, cart]); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = combos(repo), mine = repo.list('saved_foods').map((r): Food => ({ ...r.data, saved_food_id: r.id, amount_g: r.data.serving_g ?? null }));
  const query = q.trim(), results = searchableFoods(repo, meal).filter(f => !query || lower(String(f.name ?? '')).includes(lower(query))).slice(0, 12);

  const toggle = (food: Food) => { const key = foodKey(food); if (inCart(key)) removeFromCart(key); else addToCart([cartItem(key, food)]); };
  const toggleSaved = (c: Combo) => { const key = savedKey(c); if (inCart(key)) removeFromCart(key); else addToCart(c.foods.map(f => cartItem(key, f))); };
  const open = (food: Food, mineFood = false) => foodRoutes.item({ food, meal, day, source: mineFood || food.saved_food_id ? 'mine' : undefined });
  const foodRow = (food: Food, i: number, mineFood = false) => {
    const name = String(food.name ?? ''), kcal = foodKcal(food), on = inCart(foodKey(food));
    return <FoodRow key={`${foodKey(food)}-${i}`} first={i === 0} title={name} sub={foodSub(food, mineFood)} kcal={kcal} on={on}
      openLabel={`${name}${kcal == null ? '' : `, ${num(kcal)} ${t('foodKcal')}`}. ${t('foodShowDetails')}`} onOpen={() => open(food, mineFood)} onAdd={() => toggle(food)} />;
  };

  const tabs: [Tab, string][] = [['recent', t('foodTabRecent')], ['saved', t('foodTabSaved')], ['mine', t('foodTabMine')], ['results', t('foodTabResults')]];
  const go = (to: 'barcode' | 'quick' | 'copy') => to === 'copy' ? foodRoutes.copy() : foodRoutes[to](meal);

  let body;
  if (tab === 'recent') body = recent.length
    ? <><SectionLabel title={t('foodTabRecent')} /><List>{recent.map((f, i) => foodRow(f, i))}</List></>
    : <EmptyState icon="clock" color="food" title={t('foodNothingRecent')} description={t('foodNothingRecentHint')} />;
  else if (tab === 'saved') body = <><SectionLabel title={t('foodSavedMeals')} /><List>
    {saved.slice(0, 5).map((c, i) => {
      const kcal = comboKcal(c), on = inCart(savedKey(c)), foods = plural(c.foods.length, t('foodFood'), t('foodFoods'));
      return <FoodRow key={c.name} first={i === 0} title={c.name} sub={`${foods} · ${num(comboProtein(c))} g ${t('foodProteinLower')}`} kcal={kcal} on={on}
        openLabel={`${c.name}, ${foods}, ${num(kcal)} ${t('foodKcal')}`} onOpen={() => foodRoutes.saved(meal, c.name)} onAdd={() => toggleSaved(c)} />;
    })}
    <LinkRow first={!saved.length} icon="bookmark" title={fill(t('foodAllSaved'), { n: saved.length })} onPress={() => foodRoutes.saved(meal)} />
  </List></>;
  else if (tab === 'mine') body = <><SectionLabel title={t('foodTabMine')} /><List>
    {mine.map((f, i) => foodRow(f, i, true))}
    <LinkRow first={!mine.length} icon="plus" title={t('foodCreateFood')} sub={t('foodCreateFoodSub')} onPress={() => foodRoutes.quick(meal, { mine: true })} />
  </List></>;
  else body = results.length
    ? <><SectionLabel title={t('foodResults')} aside={t('foodYourFoods')} /><List>{results.map((f, i) => foodRow(f, i))}</List></>
    : <View style={{ marginTop: 12 }}><EmptyState icon="search" color="food" title={fill(t('foodNoMatch'), { q: query })} description={t('foodNoMatchHint')}
        action={{ label: fill(t('foodEnterQ'), { q: query }), variant: 'secondary', onPress: () => foodRoutes.quick(meal, { name: query }) }} /></View>;

  const totals = cartTotals(items);
  const tray = items.length ? <>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginBottom: 10 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}
      accessibilityLabel={t('foodToLog')}>
      {items.map((it, i) => <View key={`${it.key}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 220, minHeight: 36, paddingLeft: 12, paddingRight: 2, borderRadius: 999, backgroundColor: k.tint(k.c.food, 0.14) }}>
        <KitText weight={600} size={13} numberOfLines={1} style={{ flexShrink: 1 }}>{it.name}</KitText>
        <KitText weight={700} size={12.5} numeric color="text-muted">{it.kcal == null ? '–' : num(it.kcal)}</KitText>
        <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={`${t('foodRemoveWord')} ${it.name}`} onPress={() => removeCartAt(i)} hitSlop={6}
          style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={14} color={k.c['text-muted']} /></Tappable>
      </View>)}
    </ScrollView>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ gap: 2, flexShrink: 1 }}>
        <KitText weight={700} size={16} tracking={-0.01} numeric>{`${plural(items.length, t('foodFood'), t('foodFoods'))} · ${num(totals.kcal)} ${t('foodKcal')}`}</KitText>
        <KitText weight={500} size={12.5} numeric color="text-muted">{`${num(totals.p)} g ${t('foodProteinLower')}`}</KitText>
      </View>
      <Button color="food" label={fill(t('foodLogInto'), { meal: lower(mealName(repo, meal)) })}
        accessibilityLabel={fill(t('foodLogNTo'), { n: plural(items.length, t('foodFood'), t('foodFoods')), meal: mealName(repo, meal) })}
        onPress={() => { const list = items.map(i => ({ food: i.food, servings: i.servings })); router.back(); addMany(repo, day, meal, list); }} />
    </View>
  </> : null;

  return <FoodSheet testID="food-log-sheet" header={<SheetHeader title={t('foodLogFood')} left={t('cancel')} onLeft={() => router.back()} />} footer={tray}>
    <View style={{ marginBottom: 12 }}><MealSeg label={t('foodMealLabel')} meals={mealList} value={meal} onChange={setCartMeal} /></View>
    <View style={{ marginBottom: 12 }}><SearchField placeholder={t('foodSearchFoods')} accessibilityLabel={t('foodSearchFoods')} value={q}
      onChangeText={v => { setQ(v); setTab(v.trim() ? 'results' : 'recent'); }} returnKeyType="search" testID="food-log-search" /></View>
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
      {([['barcode', t('foodTileScan'), 'barcode'], ['bolt', t('foodTileQuick'), 'quick'], ['copy', t('foodCopyYesterday'), 'copy']] as const).map(([icon, label, to]) =>
        <ActionTile key={to} icon={icon} label={label} onPress={() => go(to)} />)}
    </View>
    <Chips style={{ marginBottom: -2 }}>
      {tabs.map(([id, label]) => <Chip key={id} label={label} color="food" selected={tab === id} onPress={() => setTab(id)} />)}
    </Chips>
    {body}
  </FoodSheet>;
}
