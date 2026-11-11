import { DEFAULT_PALETTE, paletteLocked, resolvePalette, type Palette } from "./tokens";

/** How every progress ring in the app is drawn. */
export const RING_LOOKS = ["contour", "liquid", "glass"] as const;
export type RingLook = (typeof RING_LOOKS)[number];
export type Looks = { palette: Palette; ring: RingLook };
export const DEFAULT_APPEARANCE: Looks = { palette: DEFAULT_PALETTE, ring: "contour" };

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
  };
}
export function formatAppearance(appearance: Looks): string {
  const extras = (["ring"] as const)
    .filter((key) => appearance[key] !== DEFAULT_APPEARANCE[key])
    .map((key) => `;${key}=${appearance[key]}`);
  return appearance.palette + extras.join("");
}
