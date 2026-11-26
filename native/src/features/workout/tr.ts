import { t, type MessageKey } from '@/i18n/en';

/** A Training string with {placeholders} filled in. */
export function tr(key: MessageKey, vars: Record<string, string | number> = {}): string {
  return t(key).replace(/\{(\w+)\}/g, (m, k: string) => k in vars ? String(vars[k]) : m);
}
/** "1 set" / "3 sets": the key's _one or _other form. */
export function trCount(base: string, n: number, vars: Record<string, string | number> = {}) {
  return tr(`${base}_${n === 1 ? 'one' : 'other'}` as MessageKey, { n, ...vars });
}
