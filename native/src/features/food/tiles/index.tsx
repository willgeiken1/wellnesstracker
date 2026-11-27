import type { Repository } from '@/data/repository';
import { t } from '@/i18n/en';
import { implementTile } from '../../tiles/registry';
import type { TileRenderProps } from '../../tiles/types';
import { fill } from '../../tiles/ui';
import { mealName } from '../actions';
import { dayView, nextMealId } from '../day';
import { foodRoutes } from '../nav';
import { attributedDay } from '../model';
import { burnedOn, foodDay } from '../selection';
import { FOOD_TILES, dayLabel, tile, weekOf } from './tiles';
import { energyUnitOf, enNum, enText } from '../energy';

/* Registers the Food tab's twelve tiles with the tile engine: what each draws, the grey text in its header and what a tap opens. */

let repo: Repository | null = null;
/** The Food tab hands its repository over so header text, worked out outside React, reads the same data. */
export function setFoodTileRepo(next: Repository | null) { repo = next; }

const sel = () => { const day = foodDay(), today = attributedDay(); return { day, today, isToday: day === today }; };
const view = () => { const s = sel(); return repo ? dayView(repo, s.day, { today: s.today, burned: burnedOn(s.day) }) : null; };
const next = () => repo ? nextMealId(dayView(repo, attributedDay())) : undefined;
const label = () => dayLabel(sel());
const toNutrition = () => foodRoutes.nutrition();
const toLog = () => foodRoutes.log(next());

const META: Record<keyof typeof FOOD_TILES, (p: TileRenderProps) => string> = {
  cal: label, macros: label, water: label, window: label,
  protein: p => p.options.view === 'meal' ? t('foodFortyAMeal') : label(),
  meals: () => { const v = view(), s = sel(); return v && s.isToday ? fill(t('foodNOfLogged'), { n: v.logged, m: v.meals.length }) : label(); },
  week: () => weekOf(sel().day),
  micros: p => p.options.show === 'limit' ? t('foodLimits') : label(),
  streak: () => t('foodLast5Weeks'),
  quick: () => repo ? fill(t('foodAddsTo'), { meal: mealName(repo, next()!).toLowerCase() }) : '',
  net: p => p.options.range === 'week' ? weekOf(sel().day) : label(),
  fits: () => { const v = repo ? dayView(repo, attributedDay()) : null; return !v ? '' : v.left > 0 ? fill(enText(t('foodKcalLeftMeta'), energyUnitOf(repo)), { v: enNum(v.left, energyUnitOf(repo)) }) : t('foodGoalReached'); },
};
const OPEN: Record<keyof typeof FOOD_TILES, () => void> = {
  cal: toNutrition, macros: toNutrition, protein: toNutrition, week: toNutrition, micros: toNutrition, net: toNutrition,
  meals: toLog, streak: toLog, quick: toLog,
  water: () => foodRoutes.water(),
  window: () => { const v = view(); const m = v?.meals.find(x => !x.empty) ?? v?.meals[0]; if (m) foodRoutes.meal(m.id); },
  fits: () => foodRoutes.saved(next()),
};

let done = false;
/** Builds every Food tile once, before the tab first draws. */
export function registerFoodTiles() {
  if (done) return; done = true;
  for (const id of Object.keys(FOOD_TILES) as (keyof typeof FOOD_TILES)[]) implementTile('food', id, { render: tile(FOOD_TILES[id]), meta: META[id], open: OPEN[id] });
}
registerFoodTiles();
