import { memo } from 'react';
import type { ColorValue } from 'react-native';
import { SvgXml } from 'react-native-svg';

/** The bar's own icons: outline for a tab at rest, a filled twin for the open tab (stroke 2). */
const NAV = {
  home: '<path d="M5 10.5L12 4L19 10.5V18A2 2 0 0 1 17 20H7A2 2 0 0 1 5 18Z"/><path d="M10 20V16A2 2 0 0 1 14 16V20"/>',
  training: '<rect x="4" y="6.5" width="4" height="11" rx="2"/><rect x="16" y="6.5" width="4" height="11" rx="2"/><path d="M8 12H16"/>',
  food: '<path d="M4 4V7A4 4 0 0 0 12 7V4M8 4V20"/><path d="M16.5 20V4A4 9 0 0 1 20.5 13H16.5"/>',
  progress: '<path d="M4 4V18A2 2 0 0 0 6 20H20"/><path d="M8.5 14.5L11.5 11.5L14 14L19 9"/>',
  routines: '<path d="M9 4H15A5 5 0 0 1 20 9V15A5 5 0 0 1 15 20H9A5 5 0 0 1 4 15V9A5 5 0 0 1 9 4Z"/><path d="M7.5 9.25L8.5 10.25L10.25 8M13.5 9H16.25M7.5 15.25L8.5 16.25L10.25 14M13.5 15H16.25"/>',
  plus: '<path d="M12 5.5V18.5M5.5 12H18.5"/>',
  check: '<path d="M5.5 12L10 16.5L18.5 8"/>',
};
const NAV_ON: Partial<Record<keyof typeof NAV, string>> = {
  home: '<path d="M5 10.5L12 4L19 10.5V18A2 2 0 0 1 17 20H14.25V15.5H9.75V20H7A2 2 0 0 1 5 18Z" fill="currentColor"/>',
  training: '<rect x="4" y="6.5" width="4" height="11" rx="2" fill="currentColor"/><rect x="16" y="6.5" width="4" height="11" rx="2" fill="currentColor"/><path d="M8 12H16"/>',
  food: '<path d="M4 4V7A4 4 0 0 0 12 7V4M8 4V20"/><path d="M16.5 20V13M16.5 4A4 9 0 0 1 20.5 13H16.5Z" fill="currentColor"/>',
  progress: '<path d="M4 4V18A2 2 0 0 0 6 20H20"/><path d="M8.5 14L11.5 11L14 13.5L19 8.5V15.5H8.5Z" fill="currentColor"/>',
  routines: '<path d="M9 3H15A6 6 0 0 1 21 9V15A6 6 0 0 1 15 21H9A6 6 0 0 1 3 15V9A6 6 0 0 1 9 3ZM8.21 8.54L8.41 8.74L9.46 7.39A1 1 0 0 1 11.04 8.61L9.29 10.86A1 1 0 0 1 7.79 10.96L6.79 9.96A1 1 0 0 1 8.21 8.54ZM13.5 8H16.25A1 1 0 0 1 17.25 9V9A1 1 0 0 1 16.25 10H13.5A1 1 0 0 1 12.5 9V9A1 1 0 0 1 13.5 8ZM8.21 14.54L8.41 14.74L9.46 13.39A1 1 0 0 1 11.04 14.61L9.29 16.86A1 1 0 0 1 7.79 16.96L6.79 15.96A1 1 0 0 1 8.21 14.54ZM13.5 14H16.25A1 1 0 0 1 17.25 15V15A1 1 0 0 1 16.25 16H13.5A1 1 0 0 1 12.5 15V15A1 1 0 0 1 13.5 14Z" fill="currentColor" fill-rule="evenodd" stroke="none"/>',
};
export type NavIconName = keyof typeof NAV;

/** The quick action icons (stroke 1.75), the same family as the kit's icon set; the names match the kit's. */
const ACTION = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><path d="M16.5 13.5v6M13.5 16.5h6"/>',
  move: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/><path d="M16.5 4.5v5M14 7l2.5-2.5L19 7M7.5 19.5v-5M5 17l2.5 2.5L10 17"/>',
  drop: '<path d="M12 3.5c3.2 3.9 6 7.3 6 10.6A6 6 0 0 1 6 14.1c0-3.3 2.8-6.7 6-10.6z"/><path d="M9.3 14.6a2.8 2.8 0 0 0 2.4 2.4"/>',
  meal: '<circle cx="12" cy="13" r="6.5"/><circle cx="12" cy="13" r="3"/><path d="M3 4v4.5M3 8.5V20M21 4c-1.4.8-2 2.6-2 5h2M21 9v11"/>',
  play: '<path d="M8 5.8v12.4a1 1 0 0 0 1.5.9l10-6.2a1 1 0 0 0 0-1.8l-10-6.2A1 1 0 0 0 8 5.8z"/>',
  repeat: '<path d="M17 3.5 20 6.5 17 9.5"/><path d="M4 11.5V10a3.5 3.5 0 0 1 3.5-3.5H20M7 20.5 4 17.5 7 14.5"/><path d="M20 12.5V14a3.5 3.5 0 0 1-3.5 3.5H4"/>',
  run: '<circle cx="14.5" cy="4.8" r="1.8"/><path d="m9 20 2.6-4.6 2.7 2 1.2 3.6M7 10.5 10 8l3.3 1 2.2 3.3 3 .7M11.6 15.4 13.3 9"/>',
  clip: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4V3h6v1M8.5 10h7M8.5 13.5h7M8.5 17h4"/>',
  timer: '<circle cx="12" cy="13.5" r="7"/><path d="M12 9.5v4l2.5 2M10 3h4M18.5 6.5l1.2-1.2"/>',
  barcode: '<path d="M4 7V5.5A1.5 1.5 0 0 1 5.5 4H7M17 4h1.5A1.5 1.5 0 0 1 20 5.5V7M20 17v1.5a1.5 1.5 0 0 1-1.5 1.5H17M7 20H5.5A1.5 1.5 0 0 1 4 18.5V17M7.5 8v8M10.5 8v8M13 8v8M16.5 8v8"/>',
  bolt: '<path d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12z"/>',
  bookmark: '<path d="M7 4h10a1 1 0 0 1 1 1v15.5l-6-4-6 4V5a1 1 0 0 1 1-1z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  scale: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 9.5a5 5 0 0 1 7 0M12 11.5l1.5-2.2"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.6-2.2h5.8L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.8" r="3.4"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16M8.5 14h7"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  ruler: '<rect x="3.5" y="8" width="17" height="8" rx="2"/><path d="M7.5 8v3M11 8v4.5M14.5 8v3M18 8v3"/>',
  share: '<path d="M12 14.5V3.5M8 7l4-3.5L16 7M6.5 11H6a2 2 0 0 0-2 2v5.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V13a2 2 0 0 0-2-2h-.5"/>',
  capsule: '<g transform="rotate(-45 12 12)"><rect x="3" y="8.25" width="18" height="7.5" rx="3.75"/><path d="M12 8.25v7.5"/></g>',
  checks: '<path d="m4 7 2 2 3.5-3.5M4 15l2 2 3.5-3.5M12.5 7.5H20M12.5 15.5H20"/>',
  swap: '<path d="M7 4.5 4 7.5l3 3M4 7.5h12.5M17 13.5l3 3-3 3M20 16.5H7.5"/>',
  reorder: '<path d="M5 7h10M5 12h10M5 17h10M18.5 5v14M16.5 7l2-2 2 2M16.5 17l2 2 2-2"/>',
  pause: '<rect x="6.5" y="5" width="3.5" height="14" rx="1.2"/><rect x="14" y="5" width="3.5" height="14" rx="1.2"/>',
  history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9M12 8v4.5l3 2"/>',
  sliders2: '<path d="M4 7h3M11 7h9M4 12h9M17 12h3M4 17h5M13 17h7"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="17" r="2"/>',
  person: '<circle cx="12" cy="8.5" r="3.75"/><path d="M4.75 20c.75-3.75 3.75-5.75 7.25-5.75s6.5 2 7.25 5.75"/>',
};
export type ActionIconName = keyof typeof ACTION;

const svg = (inner: string, stroke: number) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

/** A tab's icon; `on` draws the open tab's filled twin. Decorative: the control carries the label. */
export const NavIcon = memo(function NavIcon({ name, on = false, size = 23, color }: { name: NavIconName; on?: boolean; size?: number; color: ColorValue }) {
  return <SvgXml xml={svg((on && NAV_ON[name]) || NAV[name], 2)} width={size} height={size} color={color as string} accessible={false} />;
});
/** A quick action's icon. */
export const ActionIcon = memo(function ActionIcon({ name, size = 23, color }: { name: ActionIconName; size?: number; color: ColorValue }) {
  return <SvgXml xml={svg(ACTION[name], 1.75)} width={size} height={size} color={color as string} accessible={false} />;
});
