import type { ReactNode } from 'react';
import { t } from '@/i18n/en';
import { configuredTileToast, type TileStorage } from './store';
import type { TileColor, TileOption, TileOptionValues } from './types';

/**
 * Page sections: a page that is a list of sections rather than tiles can let a person reorder them, hide
 * them and pick a section's options. Saved on this phone under `sections-<page>`: ids and choices only.
 */
export interface PageSection {
  id: string; title: string; sub?: string; icon: string; color?: TileColor;
  options?: readonly TileOption[];
  render: (values: TileOptionValues) => ReactNode;
}
export interface SectionPrefs { order: string[]; hidden: string[]; opts: Record<string, TileOptionValues> }
const fill = (str: string, v: Record<string, string>) => str.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
const EMPTY: SectionPrefs = { order: [], hidden: [], opts: {} };
export const sectionKey = (page: string) => `sections-${page}`;

export function sectionOrder<T extends { id: string }>(prefs: SectionPrefs, list: readonly T[]): T[] {
  const ids = list.map(x => x.id), o = prefs.order.filter(id => ids.includes(id));
  ids.forEach((id, i) => { if (!o.includes(id)) o.splice(Math.min(i, o.length), 0, id); });
  return o.map(id => list.find(x => x.id === id)!);
}
export function sectionValues(prefs: SectionPrefs, x: Pick<PageSection, 'id' | 'options'>): TileOptionValues {
  const v: TileOptionValues = {}, saved = prefs.opts[x.id] ?? {};
  for (const op of x.options ?? []) v[op.id] = op.choices.some(c => String(c[0]) === String(saved[op.id])) ? String(saved[op.id]) : String(op.choices[0][0]);
  return v;
}
export const optLine = (prefs: SectionPrefs, x: PageSection) => {
  const v = sectionValues(prefs, x);
  return (x.options ?? []).map(op => op.choices.find(c => String(c[0]) === v[op.id])?.[1] ?? '').filter(Boolean).join(' · ');
};

function clean(raw: unknown): SectionPrefs {
  if (!raw || typeof raw !== 'object') return EMPTY;
  const r = raw as Partial<SectionPrefs>, strs = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []);
  const opts: Record<string, TileOptionValues> = {};
  if (r.opts && typeof r.opts === 'object') for (const [k, v] of Object.entries(r.opts)) if (v && typeof v === 'object') opts[k] = Object.fromEntries(Object.entries(v).map(([a, b]) => [a, String(b)]));
  return { order: strs(r.order), hidden: strs(r.hidden), opts };
}

export function createSectionStore(storage: TileStorage | null | undefined, page: string) {
  let prefs: SectionPrefs;
  try { prefs = clean(storage?.localGet<unknown>(sectionKey(page))); } catch { prefs = EMPTY; }
  let editing = false;
  const listeners = new Set<() => void>();
  let snap = { prefs, editing };
  const emit = () => { snap = { prefs, editing }; listeners.forEach(l => l()); };
  const save = (next: SectionPrefs | null) => {
    prefs = next ?? EMPTY;
    try { storage?.localSave(sectionKey(page), next); } catch { /* shown now; saved again with the next change */ }
    emit();
  };
  const api = {
    page,
    getState: () => snap,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    setEditing(on: boolean) { if (editing !== on) { editing = on; emit(); } },
    setOrder(ids: string[]) { save({ ...prefs, order: ids }); },
    setHidden(list: readonly PageSection[], id: string, on: boolean) {
      if (on) {
        if (prefs.hidden.includes(id)) return;
        save({ ...prefs, hidden: [...prefs.hidden, id] });
        const title = list.find(x => x.id === id)?.title;
        if (title) configuredTileToast()(fill(t('sectionsHiddenToast'), { title }), { label: t('tilesUndo'), onAction: () => api.setHidden(list, id, false) });
      } else {
        const hidden = prefs.hidden.filter(x => x !== id);
        const shown = sectionOrder(prefs, list).map(x => x.id).filter(x => x !== id && !hidden.includes(x));
        save({ ...prefs, hidden, order: [...shown, id, ...hidden] });
      }
    },
    setOption(id: string, op: string, value: string) { save({ ...prefs, opts: { ...prefs.opts, [id]: { ...(prefs.opts[id] ?? {}), [op]: value } } }); },
    reset() {
      const was = prefs;
      save(null);
      configuredTileToast()(t('sectionsResetToast'), { label: t('tilesUndo'), onAction: () => save(was) });
    },
  };
  return api;
}
export type SectionStore = ReturnType<typeof createSectionStore>;
const sectionStores = new Map<string, SectionStore>();
const sectionMeta = new Map<string, readonly PageSection[]>();
export function sectionStoreFor(storage: TileStorage | null | undefined, page: string): SectionStore {
  const k = `${storage?.owner ?? ''}\u0000${page}`;
  let s = sectionStores.get(k);
  if (!s) { s = createSectionStore(storage, page); sectionStores.set(k, s); }
  return s;
}
export function resetSectionStores() { sectionStores.clear(); sectionMeta.clear(); }
/** The sections a page last drew (the section sheet reads them). */
export const sectionsOf = (page: string) => sectionMeta.get(page);
/** Remembers the sections a page drew, for the section sheet. */
export const rememberSections = (page: string, list: readonly PageSection[]) => { sectionMeta.set(page, list); };

