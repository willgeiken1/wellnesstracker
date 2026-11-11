import source from "./tokens.json";
export const tokens = source;
export type ThemeMode = keyof typeof tokens.themes;
export type ThemeOverride = ThemeMode | "system";
export type Palette = keyof typeof tokens.palettes;
export const palettes = Object.keys(tokens.palettes) as Palette[];
export const DEFAULT_PALETTE: Palette = "seaGlassTide";
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
  if (palettes.includes(saved as Palette)) return saved as Palette;
  return LEGACY[saved] ?? DEFAULT_PALETTE;
}
/** Every palette is open today. A paid or unlockable palette is one line here; the picker already shows the lock. */
export function paletteLocked(_palette: Palette): boolean {
  return false;
}
export function createTheme(mode: ThemeMode, palette: Palette = DEFAULT_PALETTE) {
  return {
    ...tokens.themes[mode],
    ...tokens.palettes[palette][mode],
    scrim: "#00000066",
  };
}
export type ThemeColors = ReturnType<typeof createTheme>;
