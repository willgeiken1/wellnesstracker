import { router } from 'expo-router';
import type { Food } from './model';

/**
 * Where the Food tab's sheets and screens live, and the food a details sheet opens on. A food is handed over in memory
 * (it can hold a scanned product's nutrients) rather than squeezed into the address.
 */
export interface ItemTarget { food: Food; meal: string; day: string; source?: string; entryId?: string; servings?: number; onAdd?: (food: Food, servings: number, meal: string) => void }
let item: ItemTarget | null = null;
export const itemTarget = () => item;

export const foodRoutes = {
  log: (meal?: string) => router.push({ pathname: '/food/log', params: meal ? { meal } : {} }),
  meal: (meal: string) => router.push({ pathname: '/food/meal', params: { meal } }),
  item: (target: ItemTarget) => { item = target; router.push('/food/item'); },
  barcode: (meal?: string) => router.push({ pathname: '/food/barcode', params: meal ? { meal } : {} }),
  quick: (meal?: string) => router.push({ pathname: '/food/quick', params: meal ? { meal } : {} }),
  saved: (meal?: string) => router.push({ pathname: '/food/saved', params: meal ? { meal } : {} }),
  copy: () => router.push('/food/copy'),
  water: () => router.push('/food/water'),
  containers: () => router.push('/food/water-containers'),
  nutrition: () => router.push('/food/nutrition'),
};
