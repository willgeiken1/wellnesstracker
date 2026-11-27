import source from "./tokens.json";
export const tokens = source;
export type ThemeMode = keyof typeof tokens.themes;
export type ThemeOverride = ThemeMode | "system";
export type Palette = keyof typeof tokens.palettes;
/** Every palette, in the order Settings > Appearance lists them: the default first, then round the colour wheel. */
export const palettes = Object.keys(tokens.palettes) as Palette[];
export const DEFAULT_PALETTE: Palette = "orchidEvening";
// The four accents the app shipped before palettes, mapped to the closest palette (INS-01 section 1.1).
const LEGACY: Record<string, Palette> = {
  sea: "seaGlassTide",
  dusk: "moonlightDusk",
  sand: "desertMirage",
  citrus: "springCitrus",
};
/** A saved value (palette id or an older accent name) to a palette that exists; anything else is the default. */
export function resolvePalette(saved: unknown): Palette {
  if (typeof saved !== "string") return DEFAULT_PALETTE;
  if (Object.prototype.hasOwnProperty.call(tokens.palettes, saved)) return saved as Palette;
  return Object.prototype.hasOwnProperty.call(LEGACY, saved) ? LEGACY[saved] : DEFAULT_PALETTE;
}
/** Every palette is open today. A paid or unlockable palette is one line here; the picker already shows the lock. */
export function paletteLocked(_palette: Palette): boolean {
  return false;
}
/** A palette's colours for one mode. True black swaps the dark surfaces and hairlines for the OLED set; the
 * background goes to pure black and the pill under the tab bar follows. */
export function createTheme(mode: ThemeMode, palette: Palette = DEFAULT_PALETTE, trueBlack = false) {
  const p = tokens.palettes[palette];
  const base = { ...tokens.themes[mode], ...p[mode], pill: mode === "dark" ? p.dark["surface-2"] : p.light.surface, scrim: "#00000066" };
  if (mode !== "dark" || !trueBlack) return base;
  return { ...base, bg: "#000000", surface: p.oled.surface, "surface-2": p.oled["surface-2"], hair: p.oled.hair, pill: p.oled.pill };
}
export type ThemeColors = ReturnType<typeof createTheme>;
export const paletteName = (palette: Palette) => tokens.palettes[palette].name;
