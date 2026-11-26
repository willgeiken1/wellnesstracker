import * as Haptics from 'expo-haptics';
import type { Repository } from '../../data/repository';
import { showToast } from '../shell/toast';
import { fill } from '../tiles/ui';
import { t } from '../../i18n/en';
import { kcalOf, num } from './day';
import { deleteFood, logCombo, meals, saveFood, undoFood, type Combo, type Food, type Undo } from './model';
import { addDrink, litresOn, readWater, removeDrink, sizeText, waterAmt, type Container } from './water';

/* What a tap that logs does: write it, give a light tap, and say so with Undo. Copy follows the final design. */

const light = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
export const mealName = (repo: Repository, id: string) => meals(repo).find(m => m.id === id)?.name ?? '';
const lower = (s: string) => s.toLowerCase();
/** " · 412 kcal", or nothing when the energy is unknown. */
export const kcalTail = (kcal: number | null) => kcal == null ? '' : ` · ${num(kcal)} ${t('foodKcal')}`;
const shortName = (name: string) => name.split(',')[0];

/** Logs foods into a meal and returns the undo tokens' release. */
export function logFoods(repo: Repository, day: string, meal: string, foods: { food: Food; servings?: number }[]) {
  const ids: string[] = [];
  repo.atomic(() => { for (const f of foods) ids.push(saveFood(repo, day, meal, f.food, f.servings ?? 1).id); });
  return () => { const tokens: Undo[] = []; repo.atomic(() => { for (const id of ids) { try { tokens.push(deleteFood(repo, id)); } catch { /* already gone */ } } }); return tokens; };
}

/** One food, one tap: "Added chicken breast to dinner · 280 kcal", with Undo. */
export function quickAdd(repo: Repository, day: string, meal: string, food: Food, servings = 1) {
  const undo = logFoods(repo, day, meal, [{ food, servings }]), mn = lower(mealName(repo, meal));
  const kcal = kcalOf(food.energy_kj); light();
  showToast(fill(t('foodAddedTo'), { food: lower(shortName(String(food.name))), meal: mn }) + kcalTail(kcal == null ? null : kcal * servings), {
    color: 'food', ms: 4200, action: { label: t('foodUndoBtn'), onAction: () => { undo(); showToast(fill(t('foodRemovedFrom'), { meal: mn }), { color: 'food' }); } } });
}
/** Several foods at once (the log sheet's tray): "Added 3 foods to lunch". */
export function addMany(repo: Repository, day: string, meal: string, foods: { food: Food; servings: number }[]) {
  if (foods.length === 1) { quickAdd(repo, day, meal, foods[0].food, foods[0].servings); return; }
  const undo = logFoods(repo, day, meal, foods), mn = lower(mealName(repo, meal)); light();
  showToast(fill(t('foodAddedMany'), { count: foods.length, meal: mn }), {
    color: 'food', ms: 4200, action: { label: t('foodUndoBtn'), onAction: () => { undo(); showToast(fill(t('foodRemovedFrom'), { meal: mn }), { color: 'food' }); } } });
}
export const comboKcal = (c: Combo) => c.foods.reduce((a, f) => a + (kcalOf(f.energy_kj) ?? 0), 0);
export const comboProtein = (c: Combo) => c.foods.reduce((a, f) => a + (typeof f.protein_g === 'number' ? f.protein_g : 0), 0);
/** A saved meal into a meal: "Added overnight oats to breakfast · 380 kcal". */
export function addSaved(repo: Repository, day: string, meal: string, combo: Combo) {
  const before = new Set(repo.list('food_entries').map(r => r.id));
  logCombo(repo, combo, day, meal);
  const ids = repo.list('food_entries').filter(r => !before.has(r.id)).map(r => r.id), mn = lower(mealName(repo, meal)); light();
  showToast(fill(t('foodAddedTo'), { food: lower(combo.name), meal: mn }) + kcalTail(comboKcal(combo)), {
    color: 'food', ms: 4200, action: { label: t('foodUndoBtn'), onAction: () => { repo.atomic(() => ids.forEach(id => { try { deleteFood(repo, id); } catch { /* gone */ } })); showToast(fill(t('foodRemovedFrom'), { meal: mn }), { color: 'food' }); } } });
}
/** Takes a food off a meal, with Undo that puts it back. */
export function removeFood(repo: Repository, id: string, meal: string) {
  const token = deleteFood(repo, id), mn = mealName(repo, meal);
  showToast(fill(t('foodRemovedNamed'), { meal: lower(mn) }), { color: 'food', ms: 4200, action: { label: t('foodUndoBtn'), onAction: () => { undoFood(repo, token); } } });
}

/** One container, one tap: "Added Glass, 8 oz · 57 oz today", with Undo. */
export function addWater(repo: Repository, day: string, what: { c: Container } | { oz: number }) {
  const { drink, undo } = addDrink(repo, day, what); light();
  const s = readWater(repo), u = s.unit;
  const name = 'c' in what ? what.c.name : t('foodWaterOther');
  showToast(fill(t('foodWaterAdded'), { name, size: sizeText(drink.oz, u), total: waterAmt(litresOn(s, day), u) }), {
    color: 'water', ms: 4200, action: { label: t('foodUndoBtn'), onAction: () => { undo(); const n = readWater(repo); showToast(fill(t('foodWaterGone'), { name, total: waterAmt(litresOn(n, day), n.unit) }), { color: 'water' }); } } });
}
/** Takes a drink off today: "Removed Glass · 49 oz", with Undo. */
export function dropWater(repo: Repository, day: string, id: string) {
  const { drink, undo } = removeDrink(repo, day, id); if (!drink) return;
  const s = readWater(repo);
  showToast(fill(t('foodWaterRemoved'), { name: drink.name, total: waterAmt(litresOn(s, day), s.unit) }), {
    color: 'water', ms: 4200, action: { label: t('foodUndoBtn'), onAction: () => { undo(); const n = readWater(repo); showToast(fill(t('foodWaterBack'), { name: drink.name, total: waterAmt(litresOn(n, day), n.unit) }), { color: 'water' }); } } });
}
