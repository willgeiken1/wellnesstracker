import { t, type MessageKey } from '@/i18n/en';

/** A Settings string with its `{name}` slots filled. */
export function st(key: MessageKey, vars: Record<string, string | number> = {}): string {
  return t(key).replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}
