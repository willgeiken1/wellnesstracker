import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SOURCES, ICON_COLORS, EYE, ANDROID_SCALE } from '../scripts/app-icon';
import tokens from '../src/design/tokens.json';

const root = path.join(__dirname, '..');
const read = (file: string) => readFileSync(path.join(root, file));
const config = JSON.parse(read('app.json').toString()).expo;
const png = (file: string) => { const b = read(file); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] }; };

test('the icon sources are the ones the script draws, and the iOS layers use them', () => {
  for (const [name, body] of Object.entries(SOURCES)) expect(read(`assets/brand/${name}`).toString()).toBe(body);
  expect(read('assets/expo.icon/Assets/lens.svg').toString()).toBe(SOURCES['ios-lens.svg']);
  expect(read('assets/expo.icon/Assets/terrain.svg').toString()).toBe(SOURCES['ios-terrain.svg']);
  const layers = JSON.parse(read('assets/expo.icon/icon.json').toString()).groups.flatMap((g: { layers: { 'image-name': string }[] }) => g.layers.map(l => l['image-name']));
  expect(layers).toEqual(['lens.svg', 'terrain.svg']);
});

test('the icon is drawn in the default palette, not Expo template colours', () => {
  const sea = tokens.palettes.seaGlassTide.dark;
  expect(ICON_COLORS.accent).toBe(sea.accent);
  expect(SOURCES['icon.svg']).toContain(sea.accent);
  expect(JSON.stringify(config)).not.toMatch(/#208AEF|#E6F4FE/i);
});

test('the eye is E0: small, high and right, and inside the Android safe zone', () => {
  expect(EYE.half * 2).toBeLessThan(1024 * 0.6);
  expect(EYE.cx).toBeGreaterThan(512);
  expect(EYE.cy).toBeLessThan(512);
  // The far tip of the lens, after the Android shrink about the middle, stays inside the 66% safe circle.
  const tip = Math.hypot(EYE.cx + EYE.half + 14 - 512, EYE.cy - 512) * ANDROID_SCALE;
  expect(tip).toBeLessThan(1024 * 0.33);
});

test('the splash follows the default theme in light and dark', () => {
  const splash = config.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
  expect(splash.backgroundColor).toBe(tokens.palettes.seaGlassTide.light.bg);
  expect(splash.dark.backgroundColor).toBe(tokens.palettes.seaGlassTide.dark.bg);
  expect(config.android.adaptiveIcon.backgroundColor).toBe(tokens.palettes.seaGlassTide.dark.bg);
});

test('the rendered PNGs have the sizes app.json expects, and the App Store icon has no transparency', () => {
  expect(png('assets/images/icon.png')).toEqual({ width: 1024, height: 1024, colorType: 2 });
  expect(png('assets/images/android-icon-foreground.png')).toMatchObject({ width: 512, height: 512 });
  expect(png('assets/images/android-icon-background.png')).toMatchObject({ width: 512, height: 512 });
  expect(png('assets/images/android-icon-monochrome.png')).toMatchObject({ width: 432, height: 432 });
  expect(png('assets/images/favicon.png')).toMatchObject({ width: 48, height: 48 });
});
