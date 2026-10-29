// INS-01 token proposal: v2 palettes, derived roles, D6 contrast table and proposed fixes.
// Run from native/: node scripts/ins01-palette-contrast.ts --write  (rewrites the generated block in design/INS-01-TOKEN-PROPOSAL.md)
// tests/ins01-palette-contrast.test.ts recomputes the block and fails if the doc drifts.
// Proposal only: nothing here is imported by the app, and tokens.ts / tokens.json are untouched.
import { readFileSync, writeFileSync } from 'node:fs';

export const BASE_ROLES = ['bg', 'surface', 'text', 'muted', 'accent', 'onAccent', 'training', 'food', 'recovery', 'sleep', 'success', 'warn'] as const;
export type BaseRole = (typeof BASE_ROLES)[number];
export type Mode = 'dark' | 'light';
export type ModeColors = Record<BaseRole, string>;
export type Palette = { id: string; name: string; secret: 'neon' | 'holo' | null; dark: ModeColors; light: ModeColors };
export type FullColors = ModeColors & { water: string; surface2: string; hair: string; hair2: string; accentSoft: string; ai: string; accentOnText: string };
export type Proposal = { dark: FullColors; light: FullColors; changes: Change[] };
export type Change = { mode: Mode; role: string; from: string; to: string; reason: string };

const MODES: Mode[] = ['dark', 'light'];
export const MIN_TEXT = 4.5; // D6 text
export const MIN_GRAPHICS = 3; // D6 large text / UI graphics
export const MIN_DISTINCT_DE = 0.08; // OKLab distance between any two colours that carry meaning
export const WATER_PLACEHOLDER = '#4FC3F7';
export const GENERATED_START = '<!-- INS-01:GENERATED:START (node scripts/ins01-palette-contrast.ts --write) -->';
export const GENERATED_END = '<!-- INS-01:GENERATED:END -->';
export const DOC_PATH = 'design/INS-01-TOKEN-PROPOSAL.md';

// Verbatim from native/design/REDESIGN.md §5 (v2 PALETTES); the test checks the copy.
export const PALETTES: readonly Palette[] = [
  {
    id: "seaGlassTide",
    name: "Sea Glass Tide",
    secret: null,
    dark: { bg: "#0C1416", surface: "#142124", text: "#EEF5F3", muted: "#9DB3B0", accent: "#5FD8BC", onAccent: "#111111", training: "#93E07A", food: "#F2A65A", recovery: "#4AA8F0", sleep: "#E9B2EC", success: "#5FD38A", warn: "#F2C14E" },
    light: { bg: "#F2F6F4", surface: "#FFFFFF", text: "#122022", muted: "#556866", accent: "#0E7A66", onAccent: "#FFFFFF", training: "#3E7F1E", food: "#B4580E", recovery: "#1A6FB0", sleep: "#6B4FC4", success: "#1F7A43", warn: "#8F6400" },
  },
  {
    id: "mountainMist",
    name: "Mountain Mist",
    secret: null,
    dark: { bg: "#101417", surface: "#1A2026", text: "#ECF0F2", muted: "#9AA7B0", accent: "#8FC1D9", onAccent: "#111111", training: "#7DBF8E", food: "#E3A86F", recovery: "#8FB4F0", sleep: "#C3A3E0", success: "#79C99A", warn: "#E8C26A" },
    light: { bg: "#EEF1F2", surface: "#FFFFFF", text: "#161C20", muted: "#58646C", accent: "#2F6F8C", onAccent: "#FFFFFF", training: "#2F6B3E", food: "#9A5418", recovery: "#2D5FA8", sleep: "#7A4B9E", success: "#2A6B44", warn: "#7F5E00" },
  },
  {
    id: "moonlightDusk",
    name: "Moonlight Dusk",
    secret: null,
    dark: { bg: "#0E0F1A", surface: "#181A2B", text: "#EEEFFA", muted: "#A2A5C2", accent: "#A3ABFF", onAccent: "#0E0F1A", training: "#6FD6C4", food: "#F4A98A", recovery: "#8EC5FF", sleep: "#C9A6FF", success: "#6FD69A", warn: "#F2CC6B" },
    light: { bg: "#F1F1F8", surface: "#FFFFFF", text: "#161728", muted: "#5A5D78", accent: "#4B55C8", onAccent: "#FFFFFF", training: "#0F7466", food: "#A64E2C", recovery: "#2A62A8", sleep: "#7442B8", success: "#24774A", warn: "#835F00" },
  },
  {
    id: "desertMirage",
    name: "Desert Mirage",
    secret: null,
    dark: { bg: "#15110E", surface: "#211B17", text: "#F6F0EA", muted: "#B5A698", accent: "#F2B48A", onAccent: "#111111", training: "#A9C77E", food: "#F08C64", recovery: "#7FC0C2", sleep: "#B9A2E0", success: "#8CCB8A", warn: "#EFC461" },
    light: { bg: "#F6F1EA", surface: "#FFFCF8", text: "#231B15", muted: "#6B5D51", accent: "#A85F33", onAccent: "#FFFFFF", training: "#3E5C1C", food: "#B85A3C", recovery: "#1F6E70", sleep: "#6D4FA8", success: "#2F6E35", warn: "#80600A" },
  },
  {
    id: "springCitrus",
    name: "Spring Citrus",
    secret: null,
    dark: { bg: "#0F110C", surface: "#1A1D15", text: "#F3F5EC", muted: "#A3A893", accent: "#D5F56B", onAccent: "#0F110C", training: "#D5F56B", food: "#FF795C", recovery: "#4FD1D9", sleep: "#A99BFF", success: "#7EE08F", warn: "#FFD24D" },
    light: { bg: "#F4F5EE", surface: "#FFFFFF", text: "#171A10", muted: "#5B6150", accent: "#5C7A08", onAccent: "#FFFFFF", training: "#5C7A08", food: "#A85400", recovery: "#0B7178", sleep: "#5B4BC4", success: "#25793A", warn: "#7D6000" },
  },
  {
    id: "lotusGarden",
    name: "Lotus Garden",
    secret: null,
    dark: { bg: "#121014", surface: "#1D1A20", text: "#F5F1F6", muted: "#AFA6B3", accent: "#F28C82", onAccent: "#121014", training: "#7ED9B0", food: "#F28C82", recovery: "#86B8F2", sleep: "#D1A3E6", success: "#7ED99A", warn: "#F0C860" },
    light: { bg: "#F7F2F3", surface: "#FFFFFF", text: "#1E1720", muted: "#655A69", accent: "#B3443A", onAccent: "#FFFFFF", training: "#16765A", food: "#B3443A", recovery: "#2862A6", sleep: "#83439E", success: "#26743F", warn: "#7E5F00" },
  },
  {
    id: "auroraFjord",
    name: "Aurora Fjord",
    secret: null,
    dark: { bg: "#0B1218", surface: "#152029", text: "#EDF4F7", muted: "#9CB0BC", accent: "#62D2C8", onAccent: "#111111", training: "#F2F28D", food: "#DF4323", recovery: "#75D4EF", sleep: "#C84AEB", success: "#6DD49A", warn: "#F5C451" },
    light: { bg: "#EFF4F6", surface: "#FFFFFF", text: "#10202A", muted: "#536873", accent: "#0B6F6A", onAccent: "#FFFFFF", training: "#A58B12", food: "#78290D", recovery: "#2E87E0", sleep: "#4F2484", success: "#1E7444", warn: "#855C00" },
  },
  {
    id: "berryMeadow",
    name: "Berry Meadow",
    secret: null,
    dark: { bg: "#120E13", surface: "#1E1820", text: "#F7F0F6", muted: "#B3A5B1", accent: "#F06FA0", onAccent: "#120E13", training: "#D5F4A1", food: "#E8AA2C", recovery: "#305DE6", sleep: "#E83063", success: "#7EDB95", warn: "#F7CE5A" },
    light: { bg: "#F8F1F4", surface: "#FFFFFF", text: "#22131C", muted: "#6A5562", accent: "#B12A63", onAccent: "#FFFFFF", training: "#4A9F13", food: "#723E13", recovery: "#11268B", sleep: "#D32A79", success: "#25763F", warn: "#7D5E00" },
  },
  {
    id: "goldenHour",
    name: "Golden Hour",
    secret: null,
    dark: { bg: "#13110B", surface: "#1F1C14", text: "#F8F3E6", muted: "#B9AF96", accent: "#F2C14E", onAccent: "#111111", training: "#E8BD2D", food: "#CE3A37", recovery: "#70E5EF", sleep: "#784DEB", success: "#8FD39A", warn: "#F59E58" },
    light: { bg: "#F8F4EA", surface: "#FFFEFA", text: "#241E10", muted: "#685F48", accent: "#8A6400", onAccent: "#FFFFFF", training: "#6F4A15", food: "#CD6D58", recovery: "#1990C2", sleep: "#4A2AB2", success: "#2A6F3A", warn: "#9A4A0C" },
  },
  {
    id: "glacierBloom",
    name: "Glacier Bloom",
    secret: null,
    dark: { bg: "#0D1117", surface: "#171D26", text: "#EEF2F8", muted: "#A0ABBB", accent: "#9DC4FF", onAccent: "#0D1117", training: "#6DEAE7", food: "#E66E8B", recovery: "#8794CE", sleep: "#E4C675", success: "#74D69C", warn: "#F2B85A" },
    light: { bg: "#F0F3F8", surface: "#FFFFFF", text: "#121A26", muted: "#56637A", accent: "#2758B8", onAccent: "#FFFFFF", training: "#119CA0", food: "#9B2C4A", recovery: "#132185", sleep: "#938314", success: "#24733F", warn: "#8E5300" },
  },
  {
    id: "forestEmber",
    name: "Forest Ember",
    secret: null,
    dark: { bg: "#0C120E", surface: "#162019", text: "#EDF5EF", muted: "#9DB2A3", accent: "#7CD68E", onAccent: "#0C120E", training: "#AEECAD", food: "#E06245", recovery: "#4D6AEA", sleep: "#ECD358", success: "#8CDCA0", warn: "#FFB34D" },
    light: { bg: "#EFF4F0", surface: "#FFFFFF", text: "#112016", muted: "#52685A", accent: "#1F6E36", onAccent: "#FFFFFF", training: "#255F39", food: "#C0502E", recovery: "#4B92CC", sleep: "#87883A", success: "#246B3A", warn: "#8F5200" },
  },
  {
    id: "midnightNeon",
    name: "Midnight Neon",
    secret: "neon",
    dark: { bg: "#060A1A", surface: "#0D1430", text: "#EAF0FF", muted: "#8D98C6", accent: "#FF4FD8", onAccent: "#111111", training: "#7CFF4F", food: "#FF9A1F", recovery: "#3DA2FF", sleep: "#C77DFF", success: "#5FD38A", warn: "#F2C14E" },
    light: { bg: "#EDEFFA", surface: "#FFFFFF", text: "#0B1030", muted: "#5A6390", accent: "#C2189A", onAccent: "#FFFFFF", training: "#2E8A12", food: "#C25A00", recovery: "#1F5FD6", sleep: "#8A2BE2", success: "#1F7A43", warn: "#8F6400" },
  },
  {
    id: "holographicChrome",
    name: "Holographic Chrome",
    secret: "holo",
    dark: { bg: "#101215", surface: "#1E2126", text: "#F4F6F8", muted: "#A3AAB3", accent: "#E9B8FF", onAccent: "#111111", training: "#9BE36D", food: "#FFB36B", recovery: "#6EC1FF", sleep: "#E2A6FF", success: "#79C99A", warn: "#E8C26A" },
    light: { bg: "#E7EAEE", surface: "#FBFCFD", text: "#15181C", muted: "#5D646D", accent: "#8A3FB8", onAccent: "#FFFFFF", training: "#3F8A1C", food: "#B85D0E", recovery: "#1E6DB8", sleep: "#8A47B8", success: "#2A6B44", warn: "#8F6400" },
  },
];

// ---- colour math (sRGB, WCAG 2.x relative luminance, OKLab distance) ----
type RGB = [number, number, number];
const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (rgb: RGB) => '#' + rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const linear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
export const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** `t` of `b` over `a` in sRGB: v2's `color-mix` and "X at N%" alpha over an opaque surface. */
export const mix = (a: string, b: string, t: number) => {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return rgbToHex([0, 1, 2].map(i => x[i] + (y[i] - x[i]) * t) as RGB);
};
const toHsl = (hex: string): RGB => {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};
const fromHsl = (h: number, s: number, l: number) => {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
};
const oklab = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map(linear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
export const deltaE = (a: string, b: string) => {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
const minContrast = (fg: string, against: string[]) => Math.min(...against.map(bg => contrast(fg, bg)));

/** Smallest HSL-lightness move (hue and saturation kept) that clears `min` against every colour in `against`. */
const nudge = (hex: string, against: string[], min: number, direction: 1 | -1) => {
  if (minContrast(hex, against) >= min) return hex;
  const [h, s, l] = toHsl(hex);
  for (let step = 1; step <= 200; step++) {
    const next = l + direction * step * 0.005;
    if (next < 0 || next > 1) break;
    const candidate = fromHsl(h, s, next);
    if (minContrast(candidate, against) >= min) return candidate;
  }
  throw new Error(`no lightness of ${hex} reaches ${min}:1`);
};
const away = (mode: Mode): 1 | -1 => (mode === 'dark' ? 1 : -1);

// ---- derived roles (REDESIGN.md §1.2 and §5) ----
export const derive = (c: ModeColors & { water: string; ai?: string }, mode: Mode): FullColors => {
  const surface2 = mix(c.surface, c.text, mode === 'dark' ? 0.07 : 0.05);
  const surfaces = [c.bg, surface2, c.surface];
  return {
    ...c,
    surface2,
    hair: mix(c.bg, c.text, 0.09),
    hair2: mix(c.bg, c.text, 0.2),
    accentSoft: mix(c.surface, c.accent, 0.16),
    ai: c.ai ?? mix(c.accent, c.sleep, 0.5),
    // Proposed rule: the accent itself when it reads as text on every surface, else the nearest lightness that does.
    accentOnText: nudge(c.accent, surfaces, MIN_TEXT, away(mode)),
  };
};

// ---- pairs graded against D6 ----
export const TEXT_PAIRS: [keyof FullColors, keyof FullColors][] = [
  ...(['text', 'muted'] as const).flatMap(fg => (['bg', 'surface2', 'surface', 'accentSoft'] as const).map(bg => [fg, bg] as [keyof FullColors, keyof FullColors])),
  ...(['accentOnText', 'ai'] as const).flatMap(fg => (['bg', 'surface2', 'surface'] as const).map(bg => [fg, bg] as [keyof FullColors, keyof FullColors])),
  ['onAccent', 'accent'],
];
export const GRAPHIC_ROLES = ['accent', 'training', 'food', 'recovery', 'sleep', 'water', 'success', 'warn'] as const;
export const GRAPHIC_PAIRS: [keyof FullColors, keyof FullColors][] = GRAPHIC_ROLES.flatMap(fg =>
  (['bg', 'surface2', 'surface'] as const).map(bg => [fg, bg] as [keyof FullColors, keyof FullColors]),
);
export type ScoredPair = { mode: Mode; fg: string; bg: string; min: number; ratio: number; pass: boolean };
export const scorePairs = (colors: { dark: FullColors; light: FullColors }): ScoredPair[] =>
  MODES.flatMap(mode =>
    [...TEXT_PAIRS.map(p => [...p, MIN_TEXT] as const), ...GRAPHIC_PAIRS.map(p => [...p, MIN_GRAPHICS] as const)].map(([fg, bg, min]) => {
      const ratio = contrast(colors[mode][fg], colors[mode][bg]);
      return { mode, fg, bg, min, ratio, pass: ratio >= min };
    }),
  );

export const v2Colors = (p: Palette) => ({
  dark: derive({ ...p.dark, water: WATER_PLACEHOLDER }, 'dark'),
  light: derive({ ...p.light, water: WATER_PLACEHOLDER }, 'light'),
});

// ---- proposal ----
export const MEANING_ROLES = ['accent', 'training', 'food', 'recovery', 'sleep', 'water', 'success', 'warn'] as const;
type MeaningRole = (typeof MEANING_ROLES)[number];
/** Hue windows: training goes warm (design/tokens.ts base training is orange), food stays orange, water stays cyan-blue. */
const HUE_WINDOW: Partial<Record<MeaningRole, [number, number]>> = { training: [20, 60], food: [15, 40], water: [175, 225] };

/** Pairs of meaning colours closer than MIN_DISTINCT_DE in OKLab: flagged for review, not auto-fixed (v2 identity is Will's call). */
export const nearDuplicates = (colors: { dark: FullColors; light: FullColors }) =>
  MODES.flatMap(mode =>
    MEANING_ROLES.flatMap((a, i) => MEANING_ROLES.slice(i + 1).map(b => ({ mode, a, b, de: deltaE(colors[mode][a], colors[mode][b]) }))).filter(
      pair => pair.de < MIN_DISTINCT_DE,
    ),
  );

type Working = Record<Mode, ModeColors & { water: string; ai?: string }>;
const fmt = (r: number) => (Math.floor(r * 100) / 100).toFixed(2);

/** Hue (shared by both modes) that keeps `role` farthest in OKLab from every other meaning colour, at a lightness that clears 3:1. */
const pickHue = (w: Working, role: MeaningRole, reference: Record<Mode, string>) => {
  const [lo, hi] = HUE_WINDOW[role]!;
  let best: { score: number; colors: Record<Mode, string> } | null = null;
  for (let hue = lo; hue <= hi; hue++) {
    const colors = {} as Record<Mode, string>;
    let score = Infinity;
    for (const mode of MODES) {
      const d = derive(w[mode], mode);
      const [, s, l] = toHsl(reference[mode]);
      // Light mode starts mid-tone and darkens only until 3:1 passes, so blues don't fall to navy.
      colors[mode] = nudge(fromHsl(hue, s, mode === 'light' ? Math.max(l, 0.6) : l), [d.bg, d.surface2, d.surface], MIN_GRAPHICS, away(mode));
      for (const other of MEANING_ROLES) if (other !== role) score = Math.min(score, deltaE(colors[mode], w[mode][other]));
    }
    if (!best || score > best.score) best = { score, colors };
  }
  return best!;
};

export const proposePalette = (p: Palette): Proposal => {
  const w: Working = { dark: { ...p.dark, water: WATER_PLACEHOLDER }, light: { ...p.light, water: WATER_PLACEHOLDER } };
  const changes: Change[] = [];
  const set = (mode: Mode, role: keyof Working[Mode], to: string, reason: string) => {
    const from = w[mode][role] ?? mix(w[mode].accent, w[mode].sleep, 0.5);
    if (from.toUpperCase() === to.toUpperCase()) return;
    changes.push({ mode, role, from, to, reason });
    w[mode][role] = to;
  };

  // A. Text roles and the accent / onAccent pair.
  for (const mode of MODES) {
    const c = w[mode];
    const onAccentRatio = contrast(c.onAccent, c.accent);
    if (onAccentRatio < MIN_TEXT) {
      const candidates = ['#111111', '#FFFFFF', c.bg].sort((a, b) => contrast(b, c.accent) - contrast(a, c.accent));
      if (contrast(candidates[0], c.accent) >= MIN_TEXT) set(mode, 'onAccent', candidates[0], `onAccent on accent ${fmt(onAccentRatio)}:1 < ${MIN_TEXT}`);
      else set(mode, 'accent', nudge(c.accent, [c.onAccent], MIN_TEXT, luminance(c.onAccent) < 0.5 ? 1 : -1), `onAccent on accent ${fmt(onAccentRatio)}:1 < ${MIN_TEXT}`);
    }
    for (const role of ['text', 'muted'] as const) {
      for (let pass = 0; pass < 3; pass++) {
        const d = derive(c, mode);
        const against = [d.bg, d.surface2, d.surface, d.accentSoft];
        const worst = minContrast(c[role], against);
        if (worst >= MIN_TEXT) break;
        set(mode, role, nudge(c[role], against, MIN_TEXT, away(mode)), `${role} worst text pair ${fmt(worst)}:1 < ${MIN_TEXT}`);
      }
    }
  }

  // B. One colour, one meaning: duplicates of the accent move to a new hue (accent keeps the palette's signature), then water.
  for (const role of ['training', 'food'] as const) {
    if (MODES.some(mode => w[mode][role].toUpperCase() === w[mode].accent.toUpperCase())) {
      const { colors } = pickHue(w, role, { dark: w.dark[role], light: w.light[role] });
      for (const mode of MODES) set(mode, role, colors[mode], `${role} duplicated accent ${w[mode].accent} (CHECKLIST M2)`);
    }
  }
  const water = pickHue(w, 'water', { dark: w.dark.recovery, light: w.light.recovery });
  for (const mode of MODES) set(mode, 'water', water.colors[mode], 'shared placeholder; per-palette hue distinct from recovery (Q-C)');

  // C. Graphics roles to 3:1 on bg, panel and card; then the derived AI colour to 4.5:1.
  for (const mode of MODES) {
    for (const role of GRAPHIC_ROLES) {
      const d = derive(w[mode], mode);
      const against = [d.bg, d.surface2, d.surface];
      const worst = minContrast(w[mode][role], against);
      if (worst < MIN_GRAPHICS) set(mode, role, nudge(w[mode][role], against, MIN_GRAPHICS, away(mode)), `${role} worst graphics pair ${fmt(worst)}:1 < ${MIN_GRAPHICS}`);
    }
    const d = derive(w[mode], mode);
    const against = [d.bg, d.surface2, d.surface];
    const worst = minContrast(d.ai, against);
    if (worst < MIN_TEXT) set(mode, 'ai', nudge(d.ai, against, MIN_TEXT, away(mode)), `ai (accent/sleep mix ${d.ai}) worst text pair ${fmt(worst)}:1 < ${MIN_TEXT}`);
  }
  return { dark: derive(w.dark, 'dark'), light: derive(w.light, 'light'), changes };
};

// ---- report ----
const TOKEN_PATH: Record<keyof FullColors, string> = {
  bg: 'color.surface.base',
  surface2: 'color.surface.panel',
  surface: 'color.surface.card',
  text: 'color.text.primary',
  muted: 'color.text.secondary',
  accent: 'color.accent.default',
  onAccent: 'color.text.onAccent',
  accentSoft: 'color.accent.soft',
  accentOnText: 'color.accent.text',
  training: 'color.pillar.training',
  food: 'color.pillar.food',
  recovery: 'color.pillar.recovery',
  sleep: 'color.pillar.sleep',
  water: 'color.pillar.water',
  success: 'color.status.success',
  warn: 'color.status.warning',
  hair: 'color.separator.default',
  hair2: 'color.separator.strong',
  ai: 'color.ai.estimate',
};
const DERIVED = new Set(['surface2', 'hair', 'hair2', 'accentSoft', 'ai', 'accentOnText']);
const cell = (r: number, min: number) => (r >= min ? fmt(r) : `**${fmt(r)} FAIL**`);

export const renderReport = () => {
  const out: string[] = [];
  const rows = PALETTES.map(p => ({ p, v2: v2Colors(p), proposal: proposePalette(p) }));
  out.push('### Summary', '', 'Pairs graded per mode: 19 text pairs (4.5:1) and 24 graphics pairs (3:1), 43 per mode, 86 per palette.', '');
  out.push('| # | Palette | id | Secret | v2 failing pairs (dark / light) | Proposed failing pairs | Values changed | Near-duplicates flagged |', '|---|---|---|---|---|---|---|---|');
  rows.forEach(({ p, v2, proposal }, i) => {
    const before = scorePairs(v2).filter(s => !s.pass);
    const after = scorePairs(proposal).filter(s => !s.pass);
    const count = (list: ScoredPair[], mode: Mode) => list.filter(s => s.mode === mode).length;
    out.push(`| ${i + 1} | ${p.name} | \`${p.id}\` | ${p.secret ?? 'no'} | ${count(before, 'dark')} / ${count(before, 'light')} | ${after.length} | ${proposal.changes.length} | ${nearDuplicates(proposal).length} |`);
  });
  out.push('', '### Water (Q-C)', '', `Shared v2 placeholder ${WATER_PLACEHOLDER} replaced per palette. ΔE is OKLab distance to recovery (floor ${MIN_DISTINCT_DE}); "nearest" is the closest other meaning colour.`, '');
  out.push('| Palette | Recovery dark | Water dark | ΔE dark | Recovery light | Water light | ΔE light | Nearest (dark / light) |', '|---|---|---|---|---|---|---|---|');
  for (const { p, proposal } of rows) {
    const nearest = (mode: Mode) => {
      const c = proposal[mode];
      const [role, de] = MEANING_ROLES.filter(r => r !== 'water').map(r => [r, deltaE(c.water, c[r])] as const).sort((a, b) => a[1] - b[1])[0];
      return `${role} ${de.toFixed(3)}`;
    };
    const de = (mode: Mode) => deltaE(proposal[mode].water, proposal[mode].recovery).toFixed(3);
    out.push(`| ${p.name} | ${proposal.dark.recovery} | ${proposal.dark.water} | ${de('dark')} | ${proposal.light.recovery} | ${proposal.light.water} | ${de('light')} | ${nearest('dark')} / ${nearest('light')} |`);
  }
  rows.forEach(({ p, v2, proposal }, i) => {
    out.push('', `### ${i + 1}. ${p.name} (\`${p.id}\`)`, '', '**Values** (`themes.' + p.id + '.<mode>.…`; derived roles in italics)', '');
    out.push('| Role | Token path | v2 dark | v2 light | Proposed dark | Proposed light |', '|---|---|---|---|---|---|');
    for (const role of Object.keys(TOKEN_PATH) as (keyof FullColors)[]) {
      const mark = (a: string, b: string) => (a.toUpperCase() === b.toUpperCase() ? b : `**${b}**`);
      const label = DERIVED.has(role) ? `*${role}*` : role;
      out.push(`| ${label} | \`${TOKEN_PATH[role]}\` | ${v2.dark[role]} | ${v2.light[role]} | ${mark(v2.dark[role], proposal.dark[role])} | ${mark(v2.light[role], proposal.light[role])} |`);
    }
    out.push('', '**Contrast** (ratio to 1, rounded down; v2 water = shared placeholder #4FC3F7)', '');
    out.push('| Foreground on surface | Floor | v2 dark | v2 light | Proposed dark | Proposed light |', '|---|---|---|---|---|---|');
    const before = scorePairs(v2);
    const after = scorePairs(proposal);
    const perMode = before.length / 2;
    for (let k = 0; k < perMode; k++) {
      const [bd, bl, ad, al] = [before[k], before[k + perMode], after[k], after[k + perMode]];
      out.push(`| ${bd.fg} on ${bd.bg} | ${bd.min} | ${cell(bd.ratio, bd.min)} | ${cell(bl.ratio, bl.min)} | ${cell(ad.ratio, ad.min)} | ${cell(al.ratio, al.min)} |`);
    }
    out.push('', '**Fixes**', '');
    if (proposal.changes.length === 0) out.push('- None. Every v2 pair passes.');
    for (const c of proposal.changes) out.push(`- ${c.mode} \`${c.role}\`: ${c.from} → ${c.to} (${c.reason})`);
    const near = nearDuplicates(proposal);
    out.push('', `**Near-duplicates flagged** (OKLab ΔE < ${MIN_DISTINCT_DE} after the fixes above; not changed here)`, '');
    if (near.length === 0) out.push('- None.');
    for (const n of near) out.push(`- ${n.mode} \`${n.a}\` ${proposal[n.mode][n.a]} vs \`${n.b}\` ${proposal[n.mode][n.b]}: ΔE ${n.de.toFixed(3)}`);
  });
  return out.join('\n') + '\n';
};

if (process.argv.includes('--write')) {
  const doc = readFileSync(DOC_PATH, 'utf8');
  const start = doc.indexOf(GENERATED_START);
  const end = doc.indexOf(GENERATED_END);
  if (start < 0 || end < start) throw new Error(`markers missing in ${DOC_PATH}`);
  writeFileSync(DOC_PATH, `${doc.slice(0, start + GENERATED_START.length)}\n\n${renderReport()}\n${doc.slice(end)}`);
}
