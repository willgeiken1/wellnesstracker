import { DEFAULT_PALETTE, paletteLocked, resolvePalette, type Palette } from "./tokens";

/** How every progress ring in the app is drawn. */
export const RING_LOOKS = ["contour", "liquid", "glass"] as const;
export type RingLook = (typeof RING_LOOKS)[number];
/** How much moves: nothing, a gentle sweep, or a sweep with a little bounce and a pulsing drop. */
export const MOTIONS = ["basic", "calm", "lively"] as const;
export type Motion = (typeof MOTIONS)[number];
/** How strong the effects are: 1 subtle, 2 medium, 3 full. */
export const INTENSITIES = [1, 2, 3] as const;
export type Intensity = (typeof INTENSITIES)[number];
/** The tab bar: tinted with the theme's background, left as clear system glass, or a floating bar where the
 * open tab stands apart in the accent colour. */
export const BAR_LOOKS = ["standard", "glass", "floating"] as const;
export type BarLook = (typeof BAR_LOOKS)[number];
/** The number keys in the logger: solid, or glass keys with a light rim. */
export const KEYPAD_LOOKS = ["plain", "glass"] as const;
export type KeypadLook = (typeof KEYPAD_LOOKS)[number];
/** The choice controls (Workouts, Progress, Insights, Appearance): one track, the plan's default, or a row of
 * separate pill chips that scrolls sideways when there are more than fit. */
export const SELECTOR_LOOKS = ["standard", "pills"] as const;
export type SelectorLook = (typeof SELECTOR_LOOKS)[number];
/** Surfaces: the plan's flat panels (REDESIGN 1.2: no shadow, raised cards only for the body map and the Score),
 * or every block raised with a soft shadow, the look from before. */
export const SURFACE_LOOKS = ["flat", "raised"] as const;
export type SurfaceLook = (typeof SURFACE_LOOKS)[number];
/** How round the corners of panels and cards are. Soft is the plan's 12 pt. */
export const CORNER_LOOKS = ["soft", "round", "square"] as const;
export type CornerLook = (typeof CORNER_LOOKS)[number];
export const CORNER_RADIUS: Record<CornerLook, number> = { soft: 12, round: 20, square: 6 };
/** The font for titles and headings: Lexend, the plan's, or the phone's own system font. */
export const HEADING_LOOKS = ["lexend", "system"] as const;
export type HeadingLook = (typeof HEADING_LOOKS)[number];
export type Looks = { palette: Palette; ring: RingLook; motion: Motion; intensity: Intensity; bar: BarLook; keypad: KeypadLook; selector: SelectorLook;
  surface: SurfaceLook; corners: CornerLook; heading: HeadingLook };
export const DEFAULT_APPEARANCE: Looks = { palette: DEFAULT_PALETTE, ring: "contour", motion: "calm", intensity: 2, bar: "standard", keypad: "plain", selector: "standard",
  surface: "flat", corners: "soft", heading: "lexend" };
/** Every look back to the default, keeping the theme the person picked. */
export const resetLooks = (looks: Looks): Looks => ({ ...DEFAULT_APPEARANCE, palette: looks.palette });

type PresetLooks = Pick<Looks, "ring" | "motion" | "bar" | "keypad">;
/** A preset is a starting point that sets several looks at once. It never changes the theme or the strength. */
export const PRESETS = {
  basic: { ring: "contour", motion: "basic", bar: "standard", keypad: "plain" },
  calm: { ring: "contour", motion: "calm", bar: "standard", keypad: "plain" },
  fluid: { ring: "liquid", motion: "lively", bar: "standard", keypad: "plain" },
  glass: { ring: "glass", motion: "lively", bar: "glass", keypad: "glass" },
  floating: { ring: "contour", motion: "calm", bar: "floating", keypad: "plain" },
} as const satisfies Record<string, PresetLooks>;
export type Preset = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as Preset[];
/** The preset the current looks add up to, or null when the person has mixed their own. */
export const presetOf = (looks: PresetLooks): Preset | null =>
  PRESET_IDS.find((id) => (["ring", "motion", "bar", "keypad"] as const).every((key) => PRESETS[id][key] === looks[key])) ?? null;

const oneOf = <T extends string>(options: readonly T[], value: string | undefined, fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

/**
 * Looks are saved as one line of text in the existing `accent` setting: the palette id, then `;key=value` for every
 * look that is not the default. A plain palette id or an accent name from before palettes still reads correctly,
 * and anything unknown falls back to the default for that look only.
 */
export function parseAppearance(saved: unknown): Looks {
  if (typeof saved !== "string") return DEFAULT_APPEARANCE;
  const [head, ...rest] = saved.split(";");
  const pairs = new Map(rest.map((part) => part.split("=", 2) as [string, string | undefined]));
  const palette = resolvePalette(head);
  return {
    palette: paletteLocked(palette) ? DEFAULT_PALETTE : palette,
    ring: oneOf(RING_LOOKS, pairs.get("ring"), DEFAULT_APPEARANCE.ring),
    motion: oneOf(MOTIONS, pairs.get("motion"), DEFAULT_APPEARANCE.motion),
    bar: oneOf(BAR_LOOKS, pairs.get("bar"), DEFAULT_APPEARANCE.bar),
    keypad: oneOf(KEYPAD_LOOKS, pairs.get("keypad"), DEFAULT_APPEARANCE.keypad),
    selector: oneOf(SELECTOR_LOOKS, pairs.get("selector"), DEFAULT_APPEARANCE.selector),
    intensity: INTENSITIES.find((level) => String(level) === pairs.get("strength")) ?? DEFAULT_APPEARANCE.intensity,
    surface: oneOf(SURFACE_LOOKS, pairs.get("surface"), DEFAULT_APPEARANCE.surface),
    corners: oneOf(CORNER_LOOKS, pairs.get("corners"), DEFAULT_APPEARANCE.corners),
    heading: oneOf(HEADING_LOOKS, pairs.get("heading"), DEFAULT_APPEARANCE.heading),
  };
}
export function formatAppearance(appearance: Looks): string {
  const saved = { ring: "ring", motion: "motion", intensity: "strength", bar: "bar", keypad: "keypad", selector: "selector", surface: "surface", corners: "corners", heading: "heading" } as const;
  const extras = (["ring", "motion", "intensity", "bar", "keypad", "selector", "surface", "corners", "heading"] as const)
    .filter((key) => appearance[key] !== DEFAULT_APPEARANCE[key])
    .map((key) => `;${saved[key]}=${appearance[key]}`);
  return appearance.palette + extras.join("");
}
