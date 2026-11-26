import { Fragment, useState } from 'react';
import { View } from 'react-native';
import { EmptyState, KitText, List, SearchField, SheetHeader, useKit } from '@/components/kit';
import type { Repository } from '@/data/repository';
import { t } from '@/i18n/en';
import { fill } from '../tiles/ui';
import { addSaved, comboKcal, comboProtein } from './actions';
import { addToCart, cartItem, currentCart } from './cart';
import { dayView, kcalOf, nextMealId, num, plural } from './day';
import { combos, meals, type Combo } from './model';
import { useFoodDay } from './selection';
import { closeSheet, FoodRow, FoodSheet, RowLine } from './sheet';
import { MealSeg, SectionLabel } from './ui';
import { showToast } from '../shell/toast';
import { useFoodRevision } from './use-food-revision';

const lower = (s: string) => s.toLowerCase();
/** Saved meals whose name or foods hold the words. */
export function matchSaved(list: Combo[], q: string) {
  const w = lower(q.trim());
  return w ? list.filter(c => lower(c.name).includes(w) || c.foods.some(f => lower(String(f.name ?? '')).includes(w))) : list;
}

/**
 * Saved meals (`saved-meals`): search them, tap one to see its foods, tap + to add all of it. Goes into the Log food
 * tray when that sheet is open, otherwise straight into the meal.
 */
export function SavedSheet({ repo, meal: asked, open: opened }: { repo: Repository; meal?: string; open?: string }) {
  useFoodRevision(repo);
  const { day, today } = useFoodDay();
  const inTray = !!currentCart();
  const [meal, setMeal] = useState(() => currentCart()?.meal ?? (asked && meals(repo).some(m => m.id === asked) ? asked : nextMealId(dayView(repo, today, { today }))));
  const [q, setQ] = useState(''), [open, setOpen] = useState<string | null>(opened ?? null);
  const list = matchSaved(combos(repo), q);
  const add = (c: Combo) => {
    if (inTray) { addToCart(c.foods.map(f => cartItem(`meal:${c.name}`, f))); closeSheet(); showToast(fill(t('foodAddedToList'), { name: c.name }), { color: 'food' }); return; }
    closeSheet(); addSaved(repo, day, meal, c);
  };
  return <FoodSheet testID="food-saved-sheet" header={<SheetHeader title={t('foodSavedMeals')} left={t('cancel')} onLeft={() => closeSheet()} />}>
    {inTray ? null : <View style={{ marginBottom: 12 }}><MealSeg label={t('foodMealLabel')} meals={meals(repo)} value={meal} onChange={setMeal} /></View>}
    <SearchField placeholder={t('foodSearchSaved')} accessibilityLabel={t('foodSearchSaved')} value={q} onChangeText={setQ} returnKeyType="search" />
    <SectionLabel title={plural(list.length, t('foodSavedMealOne'), t('foodSavedMealMany'))} aside={t('foodTapToSee')} />
    {list.length ? <List>
      {list.map((c, i) => {
        const kcal = comboKcal(c), foods = plural(c.foods.length, t('foodFood'), t('foodFoods'));
        return <Fragment key={c.name}>
          <FoodRow first={i === 0} title={c.name} sub={`${foods} · ${num(comboProtein(c))} g ${t('foodProteinLower')}`} kcal={kcal} on={false}
            openLabel={`${c.name}, ${foods}, ${num(kcal)} ${t('foodKcal')}. ${open === c.name ? t('foodHideFoods') : t('foodShowFoods')}`}
            onOpen={() => setOpen(open === c.name ? null : c.name)} onAdd={() => add(c)} />
          {open === c.name ? <SavedFoods combo={c} /> : null}
        </Fragment>;
      })}
    </List> : <View style={{ marginTop: 8 }}><EmptyState icon="bookmark" color="food" title={q.trim() ? t('foodNoSavedMatch') : t('foodNoSavedYet')} description={t('foodNoSavedHint')} /></View>}
  </FoodSheet>;
}

function SavedFoods({ combo }: { combo: Combo }) {
  const k = useKit();
  return <View style={{ paddingTop: 2, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: k.tint(k.c.food, 0.05) }}>
    {combo.foods.map((f, i) => { const kcal = kcalOf(f.energy_kj), g = typeof f.amount_g === 'number' ? f.amount_g : null;
      return <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 7 }}>
        <RowLine inset={0} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <KitText weight={500} size={13.5}>{String(f.name ?? '')}</KitText>
          {g != null ? <KitText weight={500} size={12} color="text-muted">{`${num(g)} g`}</KitText> : null}
        </View>
        <KitText weight={700} size={13.5} numeric color="text-muted">{kcal == null ? '–' : num(kcal)}<KitText weight={600} tracking={0} size={12} color="text-muted">{` ${t('foodKcal')}`}</KitText></KitText>
      </View>; })}
  </View>;
}
