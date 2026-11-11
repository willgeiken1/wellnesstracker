import { View } from 'react-native';
import { ThemedText } from '../../components/themed-text';
import { tokens } from '../../design/tokens';
import type { Repository } from '../../data/repository';
import { t } from '../../i18n/en';
import { allFavorites, combos, type Combo, type Food } from './model';
import { energyText, GroupLabel, ItemRow, kcalOf, macroText } from './parts';

/** Saved foods, this meal's favorites and meal combos. Tapping one logs it. An empty section says how it gets filled. */
export function FoodSaved({ repo, meal, mealName, onLog, onLogCombo }: { repo: Repository; meal: string; mealName: string; onLog: (food: Food) => void; onLogCombo: (combo: Combo) => void }) {
  'use no memo';
  const saved = repo.list('saved_foods').map((row): Food => ({ ...row.data, saved_food_id: row.id, amount_g: row.data.serving_g ?? null }));
  const sections = [
    { key: 'saved', title: t('foodSavedFoods'), empty: t('foodSavedFoodsNone'), foods: saved },
    { key: 'favorites', title: t('foodFavoritesFor').replace('{meal}', mealName), empty: t('foodFavoritesNone'), foods: allFavorites(repo, meal) },
  ];
  const list = combos(repo);
  return <View style={{ gap: tokens.spacing[3] }} testID="food-saved">
    {sections.map(section => <View key={section.key}>
      <GroupLabel>{section.title}</GroupLabel>
      {!section.foods.length && <ThemedText muted variant="caption" style={{ paddingVertical: 6 }}>{section.empty}</ThemedText>}
      {section.foods.map((food, index) => <ItemRow key={index} first={index === 0} label={t('foodLogSaved').replace('{name}', String(food.name))}
        title={String(food.name)} detail={macroText(food) ?? undefined} value={energyText(food.energy_kj)} onPress={() => onLog(food)} />)}
    </View>)}
    <View>
      <GroupLabel>{t('foodCombos')}</GroupLabel>
      {!list.length && <ThemedText muted variant="caption" style={{ paddingVertical: 6 }}>{t('foodCombosNone')}</ThemedText>}
      {list.map((item, index) => {
        // A combo's calories are shown only when every food in it has them; otherwise the sum would pass off unknown as zero.
        const known = item.foods.map(food => kcalOf(food.energy_kj)), complete = known.every((n): n is number => n !== null);
        return <ItemRow key={index} first={index === 0} label={t('foodLogCombo').replace('{name}', item.name)} title={item.name}
          detail={item.foods.map(food => String(food.name)).join(', ')}
          value={complete ? t('foodEnergy').replace('{value}', known.reduce<number>((sum, n) => sum + (n ?? 0), 0).toLocaleString('en-US')) : undefined}
          onPress={() => onLogCombo(item)} />;
      })}
    </View>
  </View>;
}
