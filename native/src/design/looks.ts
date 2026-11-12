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
/** The tab bar: tinted with the theme's background, or left as clear system glass. */
export const BAR_LOOKS = ["standard", "glass"] as const;
export type BarLook = (typeof BAR_LOOKS)[number];
/** The number keys in the logger: solid, or glass keys with a light rim. */
export const KEYPAD_LOOKS = ["plain", "glass"] as const;
export type KeypadLook = (typeof KEYPAD_LOOKS)[number];
export type Looks = { palette: Palette; ring: RingLook; motion: Motion; intensity: Intensity; bar: BarLook; keypad: KeypadLook };
export const DEFAULT_APPEARANCE: Looks = { palette: DEFAULT_PALETTE, ring: "contour", motion: "calm", intensity: 2, bar: "standard", keypad: "plain" };

type PresetLooks = Pick<Looks, "ring" | "motion" | "bar" | "keypad">;
/** A preset is a starting point that sets several looks at once. It never changes the theme or the strength. */
export const PRESETS = {
  basic: { ring: "contour", motion: "basic", bar: "standard", keypad: "plain" },
  calm: { ring: "contour", motion: "calm", bar: "standard", keypad: "plain" },
  fluid: { ring: "liquid", motion: "lively", bar: "standard", keypad: "plain" },
  glass: { ring: "glass", motion: "lively", bar: "glass", keypad: "glass" },
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
    intensity: INTENSITIES.find((level) => String(level) === pairs.get("strength")) ?? DEFAULT_APPEARANCE.intensity,
  };
}
export function formatAppearance(appearance: Looks): string {
  const saved = { ring: "ring", motion: "motion", intensity: "strength", bar: "bar", keypad: "keypad" } as const;
  const extras = (["ring", "motion", "intensity", "bar", "keypad"] as const)
    .filter((key) => appearance[key] !== DEFAULT_APPEARANCE[key])
    .map((key) => `;${saved[key]}=${appearance[key]}`);
  return appearance.palette + extras.join("");
}
