import { readingOrder } from './geometry';
import type { LayoutEntry, TileDef, TileOption, TileOptionValues, TilePageConfig, TileSize, TileStyle } from './types';

/** A tile's styles. A tile without versions is its own single style, key 'A', named Standard. */
export function stylesOf(def: TileDef): readonly TileStyle[] {
  return def.versions?.length ? def.versions : [{ key: 'A', name: 'Standard', sizes: def.sizes, options: def.options, render: def.render, meta: def.meta }];
}
export function styleOf(def: TileDef, key: string | undefined): TileStyle {
  const v = stylesOf(def);
  return v.find(x => x.key === key) ?? v[0];
}
export const defaultStyle = (def: TileDef) => { const v = stylesOf(def); return (def.style && v.some(x => x.key === def.style) ? def.style : v[0].key); };
export function sizesOf(def: TileDef, key?: string): readonly TileSize[] {
  return styleOf(def, key).sizes ?? def.sizes ?? ['S', 'M'];
}
export function optionsOf(def: TileDef, key?: string): readonly TileOption[] {
  return styleOf(def, key).options ?? (def.versions?.length ? [] : def.options ?? []);
}
/** The size the tray starts on: the tile's own pick if this style offers it, else M, else the first. */
export function firstSize(def: TileDef, key?: string): TileSize {
  const ok = sizesOf(def, key);
  return def.size && ok.includes(def.size) ? def.size : ok.includes('M') ? 'M' : ok[0];
}
/** Every option of the style with a valid value: the saved one, or the first choice. */
export function optionValues(def: TileDef, key: string | undefined, saved?: TileOptionValues): TileOptionValues {
  const o: TileOptionValues = {};
  for (const op of optionsOf(def, key)) {
    const want = saved?.[op.id];
    o[op.id] = want != null && op.choices.some(c => String(c[0]) === String(want)) ? String(want) : String(op.choices[0][0]);
  }
  return o;
}
export const sameOptions = (a: TileOptionValues, b: TileOptionValues) => {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && String(a[k]) === String(b[k]));
};

export function defsById(cfg: TilePageConfig): Record<string, TileDef> {
  const m: Record<string, TileDef> = {};
  for (const d of cfg.tiles) m[d.id] = d;
  return m;
}

/** One saved entry made valid against the catalogue: unknown tiles are dropped, a size or style the tile no longer offers falls back. */
export function cleanEntry(cfg: TilePageConfig, raw: unknown): LayoutEntry | null {
  let id: unknown, size: unknown, style: unknown, opts: unknown;
  if (Array.isArray(raw)) [id, size, style, opts] = raw;
  else if (raw && typeof raw === 'object') ({ id, size, style, options: opts } = raw as Record<string, unknown>);
  else if (typeof raw === 'string') id = raw;
  if (typeof id !== 'string') return null;
  const def = cfg.tiles.find(d => d.id === id); if (!def) return null;
  const key = typeof style === 'string' && stylesOf(def).some(v => v.key === style) ? style : defaultStyle(def);
  const ok = sizesOf(def, key);
  const sz = typeof size === 'string' && (ok as readonly string[]).includes(size) ? size as TileSize : firstSize(def, key);
  const options: TileOptionValues = {};
  if (opts && typeof opts === 'object' && !Array.isArray(opts)) for (const [k, v] of Object.entries(opts)) if (typeof v === 'string' || typeof v === 'number') options[k] = String(v);
  return { id, size: sz, style: key, options };
}
/** A whole saved layout made valid: entries cleaned, duplicates dropped, in reading order. */
export function cleanLayout(cfg: TilePageConfig, raw: unknown): LayoutEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>(), out: LayoutEntry[] = [];
  for (const r of raw) { const e = cleanEntry(cfg, r); if (e && !seen.has(e.id)) { seen.add(e.id); out.push(e); } }
  return readingOrder(out);
}
export const defaultLayout = (cfg: TilePageConfig) => cleanLayout(cfg, cfg.defaults);

/* ---------- edits: each returns a new layout in reading order ---------- */
export function addEntry(cfg: TilePageConfig, list: readonly LayoutEntry[], id: string, size?: TileSize, style?: string, options?: TileOptionValues): LayoutEntry[] {
  const def = cfg.tiles.find(d => d.id === id); if (!def) return list.slice();
  const key = style && stylesOf(def).some(v => v.key === style) ? style : defaultStyle(def);
  const sz = size && sizesOf(def, key).includes(size) ? size : firstSize(def, key);
  const e: LayoutEntry = { id, size: sz, style: key, options: { ...(options ?? {}) } };
  return readingOrder(list.some(s => s.id === id) ? list.map(s => s.id === id ? e : s) : [...list, e]);
}
export function removeEntry(list: readonly LayoutEntry[], id: string): LayoutEntry[] {
  return readingOrder(list.filter(s => s.id !== id));
}
/** Puts a removed tile back where it was (Undo). */
export function restoreEntry(list: readonly LayoutEntry[], entry: LayoutEntry, at: number): LayoutEntry[] {
  if (list.some(s => s.id === entry.id)) return list.slice();
  const next = list.slice(); next.splice(Math.min(Math.max(0, at), next.length), 0, entry);
  return readingOrder(next);
}
export function setEntrySize(cfg: TilePageConfig, list: readonly LayoutEntry[], id: string, size: TileSize): LayoutEntry[] {
  const def = cfg.tiles.find(d => d.id === id);
  return readingOrder(list.map(s => s.id === id && def && sizesOf(def, s.style).includes(size) ? { ...s, size } : s));
}
/** The next size this tile offers (the corner's tap). */
export function nextSize(cfg: TilePageConfig, e: LayoutEntry): TileSize {
  const def = cfg.tiles.find(d => d.id === e.id); if (!def) return e.size;
  const ok = sizesOf(def, e.style);
  return ok[(ok.indexOf(e.size) + 1) % ok.length];
}
/**
 * Moves a tile one place earlier (-1) or later (1) in reading order (VoiceOver and the keyboard). A small tile can
 * fall back into the same half row it left, so it keeps going until its place actually changes.
 */
export function moveEntry(list: readonly LayoutEntry[], id: string, by: -1 | 1): LayoutEntry[] {
  const at = list.findIndex(s => s.id === id);
  if (at < 0) return list.slice();
  for (let to = at + by; to >= 0 && to < list.length; to += by) {
    const next = list.slice(); const [item] = next.splice(at, 1); next.splice(to, 0, item);
    const out = readingOrder(next);
    if (out.findIndex(s => s.id === id) !== at) return out;
  }
  return list.slice();
}
/** The customize sheet's pick, applied: a style that lacks the size falls back to the style's first size. */
export function customizeEntry(cfg: TilePageConfig, list: readonly LayoutEntry[], id: string, pick: { style: string; size: TileSize; options: TileOptionValues }): LayoutEntry[] {
  const def = cfg.tiles.find(d => d.id === id); if (!def) return list.slice();
  const size = sizesOf(def, pick.style).includes(pick.size) ? pick.size : firstSize(def, pick.style);
  return readingOrder(list.map(s => s.id === id ? { id, size, style: pick.style, options: optionValues(def, pick.style, pick.options) } : s));
}

/* ---------- tray ---------- */
/** The tray holds only tiles that are not on the page: adding one takes it out, removing one puts it back. */
export const trayDefs = (cfg: TilePageConfig, list: readonly LayoutEntry[]) => cfg.tiles.filter(d => !list.some(s => s.id === d.id));

export interface TrayGroup { name: string; title: string; color: string; defs: TileDef[] }
const HOME_GROUP_NAME: Record<string, string> = { 'Recovery & Sleep': 'Recovery and sleep' };
/** Tray sections in the page's order; tiles in no listed group go under More (pages only). */
export function trayGroups(cfg: TilePageConfig, defs: readonly TileDef[]): TrayGroup[] {
  const groups = cfg.groups ?? [];
  if (!groups.length) return [{ name: '', title: '', color: cfg.color as string, defs: defs.slice() }];
  const out: TrayGroup[] = [], used = new Set<string>();
  for (const [name, color] of groups) {
    const list = defs.filter(d => d.group === name); if (!list.length) continue;
    list.forEach(d => used.add(d.id));
    out.push({ name, title: cfg.variant === 'home' ? HOME_GROUP_NAME[name] ?? name : name, color: color as string, defs: list });
  }
  const rest = defs.filter(d => !used.has(d.id));
  if (rest.length) out.push({ name: 'More', title: 'More', color: cfg.color as string, defs: rest });
  return out;
}

/** What the tray card for a tile starts on: its entry on the page if it has one, else its defaults. */
export function trayStart(cfg: TilePageConfig, list: readonly LayoutEntry[], def: TileDef): { style: string; size: TileSize; options: TileOptionValues } {
  const e = list.find(s => s.id === def.id);
  if (e) return { style: e.style, size: e.size, options: { ...e.options } };
  const style = defaultStyle(def);
  return { style, size: firstSize(def, style), options: {} };
}
/** Picking a style keeps the size when the style offers it, else the style's first size (Home: M when offered). */
export function pickStyle(def: TileDef, cur: { size: TileSize }, style: string, home = false): TileSize {
  const ok = sizesOf(def, style);
  if (ok.includes(cur.size)) return cur.size;
  return home ? (ok.includes('M') ? 'M' : ok[0]) : firstSize(def, style);
}
