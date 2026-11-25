import type { ThemeColors, ThemeMode } from '@/design/tokens';
import { FRAMES } from '@/features/tiles/geometry';
import type { TileOptionValues, TileSize } from '@/features/tiles/types';
import type { HomeTileData } from '../data-types';
import { studioDepth } from './depth';
import { install as installFoodBody } from './foodbody';
import { TILE_ICONS } from './icons';
import { install as installRecovery } from './recovery';
import { install as installToday } from './today';
import { install as installTraining } from './training';

/** The font names the drawing code writes; the markup renderer swaps them for the app's Plus Jakarta Sans faces by weight. */
export const STUDIO_FONT = 'InsightSans';

/** Colours as the drawing code names them, read from the current theme. */
export interface StudioTokens {
  bg: string; surface: string; surface2: string; text: string; muted: string; accent: string; accent2: string; onAccent: string; tint: string;
  success: string; warning: string; danger: string; training: string; food: string; recovery: string; sleep: string; water: string;
  hair: string; hair2: string; ghost: string;
}
export function studioTokens(c: ThemeColors): StudioTokens {
  return {
    bg: c.bg, surface: c.surface, surface2: c['surface-2'], text: c.text, muted: c['text-muted'], accent: c.accent, accent2: c['accent-2'],
    onAccent: c['on-accent'], tint: c['accent-tint'], success: c.success, warning: c.warning, danger: c.danger, training: c.training,
    food: c.food, recovery: c.recovery, sleep: c.sleep, water: c.water, hair: c.hair, hair2: c['hair-2'], ghost: c.ghost,
  };
}

/** Units the tiles show. Data stays in kcal, lb and "h:mm AM"; only what a tile shows converts. */
export interface StudioUnits { weight: 'lb' | 'kg'; energy: 'kcal' | 'kJ'; clock: '12' | '24' }
export const DEFAULT_UNITS: StudioUnits = { weight: 'lb', energy: 'kcal', clock: '12' };
const KG = 0.45359237, KJ = 4.184;
const commas = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const pad2 = (n: number) => (n < 10 ? '0' : '') + n;

function prefs(u: StudioUnits) {
  const clk = (h: number, m: number) => u.clock === '24' ? `${pad2(((h % 24) + 24) % 24)}:${pad2(m)}` : `${h % 12 === 0 ? 12 : h % 12}:${pad2(m)} ${h % 24 >= 12 ? 'PM' : 'AM'}`;
  const parse12 = (s: string) => { const m = /^\s*(\d{1,2})(?::(\d{2}))?\s?(AM|PM)\s*$/i.exec(s); return m ? { h: (+m[1] % 12) + (/pm/i.test(m[3]) ? 12 : 0), m: m[2] ? +m[2] : 0 } : null; };
  const clkStr = (s: string) => { const t = parse12(s); return t ? clk(t.h, t.m) : s; };
  const enV = (kcal: number) => u.energy === 'kJ' ? Math.round(kcal * KJ / 10) * 10 : Math.round(kcal);
  return {
    get: (key: string) => key === 'units.clock' ? u.clock : key === 'units.energy' ? u.energy : key === 'units.weight' ? u.weight : undefined,
    clk, clkStr,
    clkText: (s: string) => String(s ?? '').replace(/\b(\d{1,2})(?::(\d{2}))?\s?(AM|PM)\b/g, all => clkStr(all)),
    enV, enParts: (kcal: number) => ({ n: commas(enV(kcal)), u: u.energy }), enU: () => u.energy,
    wtV: (lb: number) => u.weight === 'kg' ? lb * KG : +lb, wtU: () => u.weight,
    dist: (miles: number) => `${(Math.round(miles * 10) / 10).toFixed(1)} mi`,
    mask: (s: string) => s,
  };
}

interface StudioVersion { key: string; name: string; sizes?: TileSize[]; options?: { id: string; choices: [string, string][] }[]; render: (o: Record<string, string>, ctx: unknown) => string; interactive?: boolean }
interface StudioTile { id: string; title: string; versions: StudioVersion[] }

// One shared set of drawing code. Every render is pure: options, tokens and data in, markup out.
const TS2: { tiles: StudioTile[]; icons: Record<string, string>; [k: string]: unknown } = {
  tiles: [], icons: { ...TILE_ICONS }, depth: studioDepth, frames: FRAMES,
  type: { display: 34, title: 22, headline: 17, body: 16, caption: 13, eyebrow: 11, fontHeading: STUDIO_FONT, fontBody: STUDIO_FONT },
  shapes: { training: 'circle', food: 'tri', body: 'sq', recovery: 'dia' },
};
const icon = (name: string, size?: number, color?: string) =>
  `<svg viewBox="0 0 24 24" width="${size || 20}" height="${size || 20}" style="color:${color || 'currentColor'}" aria-hidden="true">${TS2.icons[name] || ''}</svg>`;
TS2.icon = icon;
let units = DEFAULT_UNITS;
const INS = { get prefs() { return prefs(units); }, icon: (name: string, size?: number) => icon(name, size) };
const host = { TS2, INS };
installToday(host); installTraining(host); installFoodBody(host); installRecovery(host);

export const studioTileIds = () => TS2.tiles.map(t => t.id);
export function studioVersion(id: string, key: string): StudioVersion | undefined {
  const t = TS2.tiles.find(x => x.id === id);
  return t?.versions.find(v => v.key === key);
}

export interface DrawArgs {
  id: string; style: string; size: TileSize; options: TileOptionValues; colors: ThemeColors; mode: ThemeMode; data: HomeTileData;
  units?: StudioUnits; uid?: string;
}
let uidSeq = 0;
/** The whole tile (frame, header and body) as markup, or null when the style is unknown. */
export function drawTile({ id, style, size, options, colors, mode, data, units: u = DEFAULT_UNITS, uid }: DrawArgs): string | null {
  const v = studioVersion(id, style);
  if (!v) return null;
  const o: Record<string, string> = {};
  for (const op of v.options ?? []) {
    o[op.id] = op.choices[0][0];
    const want = options[op.id];
    if (want != null && op.choices.some(c => c[0] === want)) o[op.id] = want;
  }
  o.size = size;
  units = u;
  const html = v.render(o, { T: studioTokens(colors), theme: mode, data, icon, type: TS2.type, frame: FRAMES[size], uid: uid ?? `hm${++uidSeq}` });
  // A day with no reading has no label.
  return html.replace(/>(null|NaN)</g, '><');
}
