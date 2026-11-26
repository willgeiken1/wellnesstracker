import { useSyncExternalStore } from 'react';
import { kcalOf } from './day';
import type { Food } from './model';

/**
 * The Log food sheet's tray. While that sheet is open, the sheets it opens (a food's details, the barcode, Quick add,
 * Saved meals) put what they pick here instead of logging it straight away, and the sheet logs the lot in one go.
 * In memory only: it lasts as long as the sheet.
 */
export interface CartItem { key: string; food: Food; servings: number; name: string; kcal: number | null; p: number | null }
interface Cart { meal: string; items: CartItem[] }

let cart: Cart | null = null;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach(l => l()); };
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const read = () => version;

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
/** One food at a number of servings, as a line in the tray. */
export function cartItem(key: string, food: Food, servings = 1): CartItem {
  const kcal = kcalOf(food.energy_kj), p = num(food.protein_g);
  return { key, food, servings, name: String(food.name ?? ''), kcal: kcal == null ? null : kcal * servings, p: p == null ? null : p * servings };
}

export function openCart(meal: string) { cart = { meal, items: [] }; emit(); }
export function closeCart() { if (!cart) return; cart = null; emit(); }
/** The open tray, or null when the Log food sheet is not open. */
export const currentCart = (): Readonly<Cart> | null => cart;
export function setCartMeal(meal: string) { if (!cart || cart.meal === meal) return; cart = { ...cart, meal }; emit(); }
export function addToCart(items: CartItem[]) { if (!cart || !items.length) return; cart = { ...cart, items: [...cart.items, ...items] }; emit(); }
/** Takes off every line added under a key (a food, or all of a saved meal's foods). */
export function removeFromCart(key: string) { if (!cart) return; cart = { ...cart, items: cart.items.filter(i => i.key !== key) }; emit(); }
export function removeCartAt(index: number) { if (!cart) return; cart = { ...cart, items: cart.items.filter((_, i) => i !== index) }; emit(); }
export const inCart = (key: string) => !!cart?.items.some(i => i.key === key);
export function cartTotals(items: readonly CartItem[]) {
  return { kcal: items.reduce((a, i) => a + (i.kcal ?? 0), 0), p: Math.round(items.reduce((a, i) => a + (i.p ?? 0), 0)) };
}

/** The tray, redrawn on every change. */
export function useCart() {
  useSyncExternalStore(subscribe, read, read);
  return cart;
}
