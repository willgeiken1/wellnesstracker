import source from "./tokens.json";
export const tokens = source;
export type ThemeMode = keyof typeof tokens.themes;
export type ThemeOverride = ThemeMode | "system";
export type Accent = keyof typeof tokens.accents;
export const accents = Object.keys(tokens.accents) as Accent[];
export function createTheme(mode: ThemeMode, accent: Accent) {
  return {
    ...tokens.themes[mode],
    ...tokens.accents[accent][mode],
    scrim: "#00000066",
  };
}
export type ThemeColors = ReturnType<typeof createTheme>;
