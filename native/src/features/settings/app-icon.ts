import type { ImageSourcePropType } from 'react-native';
import { DEFAULT_PALETTE, type Palette } from '@/design/tokens';
import { ICON_ART } from './icon-art';
import { ICON_IDS, type AppIconId } from './prefs';

/** The three app icons, in the picker's order: Lit Peaks (the default), Dusk Glow and Clear Night. */
export const APP_ICONS: readonly { id: AppIconId; name: string; key: string }[] = [
  { id: 'litPeaks', name: 'Lit Peaks', key: 'LitPeaks' },
  { id: 'duskGlow', name: 'Dusk Glow', key: 'DuskGlow' },
  { id: 'clearNight', name: 'Clear Night', key: 'ClearNight' },
];
export const iconId = (value: unknown): AppIconId => ICON_IDS.includes(value as AppIconId) ? value as AppIconId : 'litPeaks';

/** The art for an icon in a palette and look, as the picker and About show it. */
export function iconArt(icon: AppIconId, palette: Palette, mode: 'dark' | 'light'): ImageSourcePropType {
  const set = ICON_ART[icon][palette] ?? ICON_ART[icon][DEFAULT_PALETTE];
  return set[mode];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** The iOS alternate icon name for an icon, palette and look (plugins/app-icons.js names them the same way).
 * The primary (Lit Peaks, default palette, Dark) is null: iOS resets to it rather than naming it. */
export function iconName(icon: AppIconId, palette: Palette, mode: 'dark' | 'light'): string | null {
  const name = `${APP_ICONS.find(item => item.id === icon)?.key ?? 'LitPeaks'}${cap(palette)}${mode === 'dark' ? 'Dark' : 'Light'}`;
  return name === `LitPeaks${cap(DEFAULT_PALETTE)}Dark` ? null : name;
}

export interface IconHost { supportsAlternateIcons: boolean; getAppIconName(): string | null; setAlternateAppIcon(name: string | null): Promise<string | null> }
function nativeHost(): IconHost | null {
  try { return require('expo-alternate-app-icons') as IconHost; } catch { return null; }
}

/** Sets the home screen icon to match, once, and only if it differs: iOS shows its own alert every time it changes.
 * Called when the person leaves Appearance after changing the icon, the palette or the look; never at launch. */
export async function applyAppIcon(icon: AppIconId, palette: Palette, mode: 'dark' | 'light', host: IconHost | null = nativeHost()): Promise<'set' | 'same' | 'unsupported' | 'failed'> {
  if (!host || !host.supportsAlternateIcons) return 'unsupported';
  const target = iconName(icon, palette, mode);
  try {
    if ((host.getAppIconName() ?? null) === target) return 'same';
    await host.setAlternateAppIcon(target);
    return 'set';
  } catch { return 'failed'; }
}
/** Whether this phone can change its icon at all; the picker is hidden where it cannot. */
export function iconsSupported(host: IconHost | null = nativeHost()): boolean { return !!host?.supportsAlternateIcons; }
