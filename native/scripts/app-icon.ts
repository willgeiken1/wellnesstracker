// Insight app icon, E1 "eye lens with i" from design/07-app-icon (Will's pick), in the default palette (Sea Glass Tide).
// Run from native/: node scripts/app-icon.ts   -> writes the SVG sources to assets/brand/.
// The PNGs in assets/images (icon, splash, Android layers, favicon) are rendered from these SVGs at the sizes
// app.json expects; tests/app-icon.test.ts checks the sources stay in step with this script.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
// @ts-expect-error TS5097: Node runs this script with type stripping, which needs the file extension.
import { terrain } from '../src/features/home/contour.ts';

const S = 1024;
const tokens = JSON.parse(readFileSync(path.join(process.cwd(), 'src/design/tokens.json'), 'utf8')) // run from native/, like the tests;
const sea = tokens.palettes.seaGlassTide.dark;
export const ICON_COLORS = { top: '#171D1F', bottom: '#0A0F10', terrain: '#FFFFFF', lens: sea.bg, accent: sea.accent, rim: sea.text, pupil: '#070B0C' } as const;

// The same contour engine as the Home map, so the icon's terrain is the app's own terrain.
const ground = terrain([1, 0.8, 0.65], S, S, { levels: 7, sd: 0.23, strokeWidth: 5, grid: 64, wobble: 0.2, seed: 29, positions: [[0.28, 0.66], [0.8, 0.26], [0.6, 0.98]] });
const terrainPaths = ground.lines.map(line => `<path d="${line.d}" fill="none" stroke="${ICON_COLORS.terrain}" stroke-opacity="0.15" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`).join('');

// The eye: centred and large (E1), so it still reads at 29 pt on the home screen.
const cx = 512, cy = 488, half = 330, lift = 205;
const eye = `M${cx - half} ${cy} C${cx - half / 2} ${cy - lift} ${cx + half / 2} ${cy - lift} ${cx + half} ${cy} C${cx + half / 2} ${cy + lift} ${cx - half / 2} ${cy + lift} ${cx - half} ${cy}Z`;
// Magnified contour lines inside the lens: arcs around a summit below and to the right, like the Home map's hills.
const arcs = [250, 330, 410, 490, 570].map(r => `<circle cx="770" cy="790" r="${r}" fill="none" stroke="${ICON_COLORS.accent}" stroke-width="22"/>`).join('');
const pupil = `<circle cx="${cx}" cy="${cy}" r="88" fill="${ICON_COLORS.pupil}"/>`
  + `<circle cx="${cx}" cy="${cy - 40}" r="17" fill="${ICON_COLORS.rim}"/>`
  + `<rect x="${cx - 14}" y="${cy - 8}" width="28" height="70" rx="14" fill="${ICON_COLORS.rim}"/>`;

/** The lens on its own: rim, lines and the i, on a transparent ground. `scale` shrinks it about the centre. */
export function lens(scale = 1, mono = false) {
  const t = `translate(${cx} ${S / 2}) scale(${scale}) translate(${-cx} ${-S / 2})`;
  if (mono) return `<g transform="${t}"><path d="${eye}" fill="none" stroke="#FFFFFF" stroke-width="34"/><circle cx="${cx}" cy="${cy}" r="88" fill="#FFFFFF"/></g>`;
  return `<g transform="${t}"><clipPath id="lens"><path d="${eye}"/></clipPath>`
    + `<path d="${eye}" fill="${ICON_COLORS.lens}"/><g clip-path="url(#lens)">${arcs}</g>${pupil}`
    + `<path d="${eye}" fill="none" stroke="${ICON_COLORS.rim}" stroke-width="34" stroke-linejoin="round"/></g>`;
}
export function ground1024() {
  return `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ICON_COLORS.top}"/><stop offset="1" stop-color="${ICON_COLORS.bottom}"/></linearGradient></defs>`
    + `<rect width="${S}" height="${S}" fill="url(#bg)"/>${terrainPaths}`;
}
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${body}</svg>\n`;

export const SOURCES = {
  // Full icon: iOS (Apple rounds the corners itself), favicon and the splash tile.
  'icon.svg': svg(ground1024() + lens()),
  // Android adaptive layers: the lens sits inside the 66% safe zone of the foreground.
  'android-background.svg': svg(ground1024()),
  'android-foreground.svg': svg(lens(0.7)),
  'android-monochrome.svg': svg(lens(0.7, true)),
  // iOS 26 layered icon (assets/expo.icon): the system fills the ground colour, then the terrain, then the lens.
  'ios-terrain.svg': svg(terrainPaths),
  'ios-lens.svg': svg(lens()),
} as const;

if (process.argv[1]?.endsWith('app-icon.ts')) {
  mkdirSync('assets/brand', { recursive: true });
  for (const [name, body] of Object.entries(SOURCES)) writeFileSync(`assets/brand/${name}`, body);
}
